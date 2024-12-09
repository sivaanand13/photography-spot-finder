import express from "express";
import validation from "../validation.js";
import { userData } from "../data/index.js";
import logging from "../log.js";
import { contestSubmissions } from "../config/mongoCollections.js";
import { sendVerificationEmail, verifyOtp } from "../emailVerification.js";



const router = express.Router();

router
  .route("/signup")
  .get(async (req, res) => {
    res.render("users/signup");
  })
  .post(async (req, res) => {
    const loginData = req.body;
    console.log(loginData);
    let errors = [];
    try {
      loginData.firstName = validation.validateString(
        loginData.firstName,
        "First Name"
      );
    } catch (e) {
      errors = errors.concat([e]);
    }

    try {
      loginData.lastName = validation.validateString(
        loginData.lastName,
        "Last Name"
      );
    } catch (e) {
      errors = errors.concat([e]);
    }

    try {
      loginData.username = validation.validateUsername(
        loginData.username,
        "User Name"
      );
    } catch (e) {
      console.log(e);
      errors = errors.concat(e);
    }

    try {
      validation.validatePassword(loginData.password, "Password");
    } catch (e) {
      console.log(e);
      errors = errors.concat(e);
    }

    try {
      await userData.verifyNewUsername(loginData.username);
    } catch (e) {
      errors = errors.concat(e);
    }

    console.log(loginData);
    if (errors.length !== 0) {
      return res.render("users/signup", {
        errors,
        hasErrors: true,
        data: loginData,
      });
    }

    let userFromDb;
    try {
      userFromDb = await userData.createUser(
        loginData.firstName,
        loginData.lastName,
        loginData.username,
        loginData.password
      );
    } catch (e) {
      return res.render("users/signup", {
        errors,
        hasErrors: true,
        user: loginData,
      });
    }
    req.session.user = {
      _id: userFromDb._id.toString(),
      firstName: userFromDb.firstName,
      lastName: userFromDb.lastName,
      username: userFromDb.username,
    };
    res.redirect(`/users/profile/${req.session.user.username}`);
  });

router
  .route("/login")
  .get(async (req, res) => {
    if (req.query.message) {
      if (req.session.authorizationErrors) {
        req.session.authorizationErrors.push(req.query.message);
      } else {
        req.session.authorizationErrors = [req.query.message];
      }
    }
    res.render("users/login", {
      authErrors: req.session.authorizationErrors,
      hasAuthErrors: true,
    });
    delete req.session.authorizationErrors;
  })
  .post(async (req, res) => {
    const loginData = req.body;
    let errors = [];

    try {
      validation.validateLoginPassword(loginData.password, "Password");
    } catch (e) {
      errors = errors.concat(e);
    }

    if (errors.length !== 0) {
      return res.render("users/login", {
        errors,
        hasErrors: true,
        data: loginData,
      });
    }

    let userFromDb;
    try {
      userFromDb = await userData.authenticateUser(
        loginData.username,
        loginData.password
      );
    } catch (e) {
      errors = errors.concat("Username or Password is invalid!");
    }
    logging.log(errors);

    if (errors.length !== 0) {
      return res.render("users/login", {
        errors,
        hasErrors: true,
        data: loginData,
        user: req.session.user,
      });
    }

    req.session.user = {
      _id: userFromDb._id.toString(),
      firstName: userFromDb.firstName,
      lastName: userFromDb.lastName,
      username: userFromDb.username,
      role: userFromDb.role,
    };
    logging.log(req.session.user);
    if (req.session.user.role === "admin") {
      res.redirect("/admin");
    } else {
      res.redirect(`/users/profile/${req.session.user.username}`);
    }
  });

router.route("/logout").get(async (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

router.route("/profile/:username").get(async (req, res) => {
  const username = req.params.username.toLowerCase();
  let userProfile;
  try {
    userProfile = await userData.getUserProfileByUsername(username);
  } catch (e) {
    return res.status(404).render("users/profile", {
      notfound: true,
      user: req.session.user,
      username: username,
      styles: [`<link rel="stylesheet" href="/public/css/userProfile.css">`],
    });
  }
  const userFavoriteSpots = await userData.getAndUpdateUserFavoriteSpots(
    userProfile._id
  );
  const userSubmittedSpots = await userData.getUserSubmittedSpots(
    userProfile._id
  );
  const userComments = await userData.getUserComments(userProfile._id);
  const userContestSubmissions = await userData.getUserContestSubmissions(
    userProfile._id
  );
  const userRatings = await userData.getUserRatings(userProfile._id);
  let sameUser = false;
  if (req.session.user) {
    if (userProfile._id === req.session.user._id) {
      sameUser = true;
    }
  }
  res.render("users/profile", {
    profile: userProfile,
    user: req.session.user,
    authErrors: req.session.authorizationErrors,
    sameUser: sameUser,
    styles: [`<link rel="stylesheet" href="/public/css/userProfile.css">`],
    favoriteSpots: userFavoriteSpots,
    submittedSpots: userSubmittedSpots,
    comments: userComments,
    ratings: userRatings,
    contestSubmissions: userContestSubmissions,
  });
  delete req.session.authorizationErrors;
});

router
  .route("/editprofile")
  .get(async (req, res) => {
    let errors = [];
    if (!req.session.user) {
      errors.push("You must login before trying to edit profile!");
      req.session.authorizationErrors = errors;
      return res.status(401).redirect("/users/login");
    }
    let userId = req.session.user._id;
    try {
      userId = validation.validateString(userId.toString(), "userId", true);
    } catch (e) {
      errors = errors.concat(e);
    }
    let userInfo;
    try {
      userInfo = await userData.getUserProfileById(userId);
    } catch (e) {
      errors = errors.concat(e);
    }
    if (errors.length > 0) {
      req.session.authorizationErrors = errors;
      return res.status(401).redirect("/users/login");
    }
    return res
      .status(200)
      .render("users/editprofile", { data: userInfo, user: req.session.user });
  })
  .patch(async (req, res) => {
  
    const updateData = req.body;
    //console.log("printing");
    console.log(updateData);
    let errors = [];
    if (!req.session.user) {
      errors.push("You must login before trying to edit profile!");
      req.session.authorizationErrors = errors;
      return res.status(401).redirect("/users/login");
    }
    let userId = req.session.user._id;
    try {
      userId = validation.validateString(userId.toString(), "userId", true);
    } catch (e) {
      errors = errors.concat(e);
    }
    let userInfo;
    try {
      userInfo = await userData.getUserProfileById(userId);
    } catch (e) {
      errors = errors.concat(e);
    }
    if (errors.length > 0) {
      req.session.authorizationErrors = errors;
      return res.status(401).redirect("/users/login");
    }

    try {
      updateData.firstName = validation.validateString(
        updateData.firstName,
        "First Name"
      );
    } catch (e) {
      errors = errors.concat([e]);
    }

    try {
      updateData.lastName = validation.validateString(
        updateData.lastName,
        "Last Name"
      );
    } catch (e) {
      errors = errors.concat([e]);
    }

    try {
      updateData.email = validation.validateEmail(updateData.email);
    } catch (e) {
      errors = errors.concat(e);
    }

    try {
      updateData.bio = validation.validateString(updateData.bio);
    } catch (e) {
      errors = errors.concat(e);
    }

    console.log(updateData);
    if (errors.length !== 0) {
      return res.status(400).render("users/editprofile", {
        errors,
        hasErrors: true,
        data: updateData,
        user: req.session.user,
      });
    }
    updateData.username = req.session.user.username;

    try {
      let updatedUser = await userData.updateUserProfile(updateData);
    } catch (e) {
      errors = errors.concat(e);
      return res.status(400).render("users/editprofile", {
        errors,
        hasErrors: true,
        data: updateData,
        user: req.session.user,
      });
    }

    return res
      .status(200)
      .redirect(`/users/profile/${req.session.user.username}`);
  });

router
  .route("/updatepassword")
  .get(async (req, res) => {
    let errors = [];
    if (!req.session.user) {
      errors.push("You must login before trying to update password!");
      req.session.authorizationErrors = errors;
      return res.status(401).redirect("/users/login");
    }
    let userId = req.session.user._id;
    try {
      userId = validation.validateString(userId.toString(), "userId", true);
    } catch (e) {
      errors = errors.concat(e);
    }
    let userInfo;
    try {
      userInfo = await userData.getUserProfileById(userId);
    } catch (e) {
      errors = errors.concat(e);
    }
    if (errors.length > 0) {
      req.session.authorizationErrors = errors;
      return res.status(401).redirect("/users/login");
    }
    return res.status(200).render("users/updatepassword", {
      data: userInfo,
      user: req.session.user,
    });
  })
  .patch(async (req, res) => {
    const updateData = req.body;
    console.log(updateData);
    let errors = [];
    if (!req.session.user) {
      errors.push("You must login before trying to update password!");
      req.session.authorizationErrors = errors;
      return res.status(401).redirect("/users/login");
    }
    let userId = req.session.user._id;
    try {
      userId = validation.validateString(userId.toString(), "userId", true);
    } catch (e) {
      errors = errors.concat(e);
    }
    let userInfo;
    try {
      userInfo = await userData.getUserProfileById(userId);
    } catch (e) {
      errors = errors.concat(e);
    }
    if (errors.length > 0) {
      req.session.authorizationErrors = errors;
      return res.status(401).redirect("/users/login");
    }

    try {
      validation.validateLoginPassword(
        updateData.currentpassword,
        "Current Password"
      );
    } catch (e) {
      errors = errors.concat(e);
    }

    try {
      validation.validatePassword(updateData.newpassword, "New Password");
    } catch (e) {
      console.log(e);
      errors = errors.concat(e);
    }

    if (errors.length !== 0) {
      return res.status(400).render("users/updatepassword", {
        errors,
        hasErrors: true,
        data: updateData,
        user: req.session.user,
      });
    }

    let userFromDb;
    try {
      userFromDb = await userData.authenticateUser(
        req.session.user.username,
        updateData.currentpassword
      );
    } catch (e) {
      errors = errors.concat("Current password is incorrect!");
    }
    logging.log(errors);

    if (errors.length !== 0) {
      return res.status(400).render("users/updatepassword", {
        errors,
        hasErrors: true,
        data: updateData,
        user: req.session.user,
      });
    }

    const userObj = {
      username: req.session.user.username,
      password: updateData.newpassword,
    };

    try {
      let updatedUser = await userData.updateUserProfile(userObj);
    } catch (e) {
      errors = errors.concat(e);
      return res.status(400).render("users/updatepassword", {
        errors,
        hasErrors: true,
        data: updateData,
        user: req.session.user,
      });
    }

    req.session.destroy();
    return res.redirect(
      "/users/login?message=Please%20login%20again%20to%20continue"
    );
  });

router.route("/editprofile/removeEmail").delete(async (req, res) => {
  let errors = [];
  if (!req.session.user) {
    errors.push("You must login before trying to update profile!");
    req.session.authorizationErrors = errors;
    return res.status(401).redirect("/users/login");
  }
  let userId = req.session.user._id;
  try {
    userId = validation.validateString(userId.toString(), "userId", true);
  } catch (e) {
    errors = errors.concat(e);
  }
  let userInfo;
  try {
    userInfo = await userData.getUserProfileById(userId);
  } catch (e) {
    errors = errors.concat(e);
  }
  if (errors.length > 0) {
    req.session.authorizationErrors = errors;
    return res.status(401).redirect("/users/login");
  }
  let acknowledged;
  try {
    acknowledged = await userData.removeEmail(userId);
    return res.redirect(`/users/profile/${req.session.user.username}`);
  } catch (e) {
    errors = errors.concat(e);
  }
  if (!acknowledged || !acknowledged.emailRemoved) {
    return res.status(500).render("error", {
      message: "500: Internal Server Error",
      user: req.session.user,
    });
  }
});

router.route("/editprofile/removeBio").delete(async (req, res) => {
  let errors = [];
  if (!req.session.user) {
    errors.push("You must login before trying to update profile!");
    req.session.authorizationErrors = errors;
    return res.status(401).redirect("/users/login");
  }
  let userId = req.session.user._id;
  try {
    userId = validation.validateString(userId.toString(), "userId", true);
  } catch (e) {
    errors = errors.concat(e);
  }
  let userInfo;
  try {
    userInfo = await userData.getUserProfileById(userId);
  } catch (e) {
    errors = errors.concat(e);
  }
  if (errors.length > 0) {
    req.session.authorizationErrors = errors;
    return res.status(401).redirect("/users/login");
  }
  let acknowledged;
  try {
    acknowledged = await userData.removeBio(userId);
    return res.redirect(`/users/profile/${req.session.user.username}`);
  } catch (e) {
    errors = errors.concat(e);
  }
  if (!acknowledged || !acknowledged.bioRemoved) {
    return res.status(500).render("error", {
      message: "500: Internal Server Error",
      user: req.session.user,
    });
  }
});

router
  .route("/search")
  .get(async (req, res) => {
    return res.status(200).render("users/search", {
      user: req.session.user,
      styles: [`<link rel="stylesheet" href="/public/css/userSearch.css">`],
    });
  })
  .post(async (req, res) => {
    const body = req.body;
    let errors = [];
    if (!req.body) {
      errors.push("Request body is empty");
    }
    if (errors.length != 0) {
      return res.status(400).render("users/search", {
        user: req.session.user,
        errors: errors,
        styles: [`<link rel="stylesheet" href="/public/css/userSearch.css">`],
      });
    }
    let keyword = req.body.keyword;
    try {
      keyword = validation.validateString(keyword, "keyword", false);
    } catch (e) {
      errors = errors.concat(e);
    }
    if (errors.length != 0) {
      return res.status(400).render("users/search", {
        user: req.session.user,
        errors: errors,
        styles: [`<link rel="stylesheet" href="/public/css/userSearch.css">`],
      });
    }
    let usersFound;
    try {
      usersFound = await userData.getUsersByKeyword(keyword);
    } catch (e) {
      errors = errors.concat(e);
      return res.status(400).render("users/search", {
        user: req.session.user,
        errors: errors,
        keyword: keyword,
      });
    }
    return res.status(200).render("users/search", {
      user: req.session.user,
      keyword: keyword,
      usersFound: usersFound,
      searched: true,
      styles: [`<link rel="stylesheet" href="/public/css/userSearch.css">`],
    });
  });


  router.post("/send-otp", async (req, res) => {
    const { email } = req.body;
    try {
      const user = await userData.getUserProfileByUsername(req.session.user.username);
      const result = await sendVerificationEmail(user._id, email);
      res.json(result);
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  });
  
  router.post("/verify-otp", async (req, res) => {
    const { otp, newEmail } = req.body;
    try {
      const user = await userData.getUserProfileByUsername(req.session.user.username);
      const result = await verifyOtp(user._id, otp, newEmail);
      res.json(result);
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  });
  
  router.route("/editprofile")
    .get(async (req, res) => {
      let errors = [];
      if (!req.session.user) {
        errors.push("You must login before trying to edit profile!");
        req.session.authorizationErrors = errors;
        return res.status(401).redirect("/users/login");
      }
      let userId = req.session.user._id;
      try {
        userId = validation.validateString(userId.toString(), "userId", true);
      } catch (e) {
        errors = errors.concat(e);
      }
      let userInfo;
      try {
        userInfo = await userData.getUserProfileById(userId);
      } catch (e) {
        errors = errors.concat(e);
      }
      if (errors.length > 0) {
        req.session.authorizationErrors = errors;
        return res.status(401).redirect("/users/login");
      }
      return res.status(200).render("users/editprofile", { data: userInfo, user: req.session.user });
    })
    .patch(async (req, res) => {
      const updateData = req.body;
      let errors = [];
      if (!req.session.user) {
        errors.push("You must login before trying to edit profile!");
        req.session.authorizationErrors = errors;
        return res.status(401).redirect("/users/login");
      }
      let userId = req.session.user._id;
      try {
        userId = validation.validateString(userId.toString(), "userId", true);
      } catch (e) {
        errors = errors.concat(e);
      }
      let userInfo;
      try {
        userInfo = await userData.getUserProfileById(userId);
      } catch (e) {
        errors = errors.concat(e);
      }
      if (errors.length > 0) {
        req.session.authorizationErrors = errors;
        return res.status(401).redirect("/users/login");
      }
  
      // Set OTP-related fields to null
      updateData.otp = null;
      updateData.otpExpiration = null;
  
      try {
        await userData.updateUserProfile(updateData);
      } catch (e) {
        errors = errors.concat(e);
        return res.status(400).render("users/editprofile", {
          errors,
          hasErrors: true,
          data: updateData,
          user: req.session.user,
        });
      }
      return res.status(200).redirect(`/users/profile/${req.session.user.username}`);
    });
  
  router.route("/editprofile/removeEmail").delete(async (req, res) => {
    let errors = [];
    if (!req.session.user) {
      errors.push("You must login before trying to update profile!");
      req.session.authorizationErrors = errors;
      return res.status(401).redirect("/users/login");
    }
    let userId = req.session.user._id;
    try {
      userId = validation.validateString(userId.toString(), "userId", true);
    } catch (e) {
      errors = errors.concat(e);
    }
    let userInfo;
    try {
      userInfo = await userData.getUserProfileById(userId);
    } catch (e) {
      errors = errors.concat(e);
    }
    if (errors.length > 0) {
      req.session.authorizationErrors = errors;
      return res.status(401).redirect("/users/login");
    }
    let acknowledged;
    try {
      acknowledged = await userData.removeEmail(userId);
      return res.redirect(`/users/profile/${req.session.user.username}`);
    } catch (e) {
      errors = errors.concat(e);
    }
    if (!acknowledged || !acknowledged.emailRemoved) {
      return res.status(500).render("error", {
        message: "500: Internal Server Error",
        user: req.session.user,
      });
    }
  });
  
 

export default router;
