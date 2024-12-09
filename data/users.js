import {
  users,
  spots,
  comments,
  spotRatings,
  contestSubmissions,

} from "../config/mongoCollections.js";
import { SALT_ROUNDS } from "../config/secrets.js";
import validation from "../validation.js";
import bcrypt from "bcrypt";
import logger from "../log.js";
import { ObjectId } from "mongodb";
import { spotsData, contestData } from "./index.js";


export const createUser = async (firstName, lastName, username, password) => {
  firstName = validation.validateString(firstName, "First Name");
  lastName = validation.validateString(lastName, "Last Name");
  username = validation.validateUsername(username, "Username");
  validation.validatePassword(password, "Password");

  // verify no current user has the given username
  await verifyNewUsername(username);
  const salt = bcrypt.genSaltSync(SALT_ROUNDS);
  const encryptedPassword = bcrypt.hashSync(password, salt);

  const newUser = {
    username,
    email: "",
//    usercode: "",
    firstName,
    lastName,
    bio: "",
    password: encryptedPassword,
    isVerified: false,
    role: "user",
    favoriteSpots: [],
    spotReports: [],
    commentReports: [],
    contestReports: [],
  };

  const usersCollection = await users();
  const insertInfo = await usersCollection.insertOne(newUser);
  if (!insertInfo.acknowledged || !insertInfo.insertedId)
    throw "Could not add the new user";

  const userInfo = await getUserByUsername(username);
  return userInfo;
};

const authenticateUser = async (username, password) => {
  username = validation.validateUsername(username, "Username");
  validation.validateLoginPassword(password, "Password");

  const filter = {
    username,
    password,
  };

  const userInfo = await getUserByUsername(username, true);
  if (await bcrypt.compare(password, userInfo.password)) {
    return await getUserByUsername(userInfo.username);
  } else {
    throw [`Invalid password for user ${username}!`];
  }
};

const checkIfEmailExists = async (email, username) => {
  username = validation.validateUsername(username);
  email = validation.validateEmail(email);
  const usersCollection = await users();
  const user = await usersCollection.findOne(
    { email: email },
    { projection: { _id: 0, email: 1, username: 1 } }
  );
  if (user && user.username !== username) {
    throw ["This email is already associated with another account!"];
  }
};

export const removeEmail = async (userId) => {
  userId = validation.validateString(userId, "userId", true);
  const user = await getUserProfileById(userId);
  const usersCollection = await users();
  const updatedUser = await usersCollection.findOneAndUpdate(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: { email: "", isVerified: false  } },
    { returnDocument: "after" }
  );
  if (!updatedUser) {
    throw ["Failed to remove email"];
  }
  return { emailRemoved: true };
};

export const removeBio = async (userId) => {
  userId = validation.validateString(userId, "userId", true);
  const user = await getUserProfileById(userId);
  const usersCollection = await users();
  const updatedUser = await usersCollection.findOneAndUpdate(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: { bio: "" } },
    { returnDocument: "after" }
  );
  if (!updatedUser) {
    throw ["Failed to remove bio"];
  }
  return { bioRemoved: true };
};

export const updateUserProfile = async (userObject) => {
  logger.log("Trying to update profile: ");
  logger.log(userObject);
  validation.validateObject(userObject, "Update object");

  // Validate existing user
  let username = userObject.username;
  let userInfo;
  try {
    username = validation.validateString(username, "username");
    userInfo = await getUserByUsername(username);
  } catch (e) {
    throw ["User profile update failed. Invalid username."];
  }

  // Throw if no additional fields provided for update
  if (Object.keys(userObject).length === 1) {
    throw [`Must provide at least one update field to update user profile!`];
  }

  let firstName = userObject.firstName;
  let lastName = userObject.lastName;
  let email = userObject.email;
  let oldEmail = userObject.oldEmail;
  let bio = userObject.bio;
  let otp = userObject.otp;
  let otpExpiration = userObject.otpExpiration;
  let isVerified = userObject.isVerified;

  let errors = [];
  let updateUserProfile = {};

  if (firstName !== undefined) {
    try {
      firstName = validation.validateString(firstName);
      updateUserProfile.firstName = firstName;
    } catch (e) {
      errors = errors.concat(e);
    }
  }

  if (lastName !== undefined) {
    try {
      lastName = validation.validateString(lastName);
      updateUserProfile.lastName = lastName;
    } catch (e) {
      errors = errors.concat(e);
    }
  }

  if (email !== undefined) {
    try {
      email = validation.validateEmail(email);
      updateUserProfile.email = email;
    } catch (e) {
      errors = errors.concat(e);
    }
    try {
      await checkIfEmailExists(email, username);
    } catch (e) {
      errors = errors.concat(e);
    }
  }

  if (oldEmail !== undefined) {
    updateUserProfile.oldEmail = oldEmail;
  }

  if (otp !== undefined) {
    updateUserProfile.otp = otp;
  }

  if (otpExpiration !== undefined) {
    updateUserProfile.otpExpiration = otpExpiration;
  }

  if (isVerified !== undefined) {
    updateUserProfile.isVerified = isVerified;
  }

  if (bio !== undefined) {
    try {
      bio = validation.validateString(bio);
      updateUserProfile.bio = bio;
    } catch (e) {
      errors = errors.concat(e);
    }
  }

  if (errors.length > 0) {
    throw errors;
  }

  const filter = {
    _id: ObjectId.createFromHexString(userInfo._id.toString()),
  };
  const userProfile = {
    $set: updateUserProfile,
  };

  const usersCollection = await users();
  try {
    const insertInfo = await usersCollection.updateOne(filter, userProfile);
  } catch (e) {
    throw ["Update failed!"];
  }

  return await getUserProfileById(userInfo._id.toString());
};

const getUserByUsername = async (username, includePassword) => {
  username = validation.validateUsername(username, "Username");
  if (includePassword)
    validation.validateBoolean(includePassword, "Include Password");

  const filter = {
    username,
  };

  let options = {};
  if (includePassword && includePassword === true) {
    options.projection = {
      _id: 1,
      firstName: 1,
      lastName: 1,
      username: 1,
      password: 1,
      role: 1,
    };
  } else {
    options.projection = {
      _id: 1,
      firstName: 1,
      username: 1,
      lastName: 1,
      role: 1,
    };
  }

  const usersCollection = await users();
  const userInfo = await usersCollection.findOne(filter, options);
  if (!userInfo) throw [`Could not find user with username (${username})`];

  return userInfo;
};

const getUserProfileById = async (id) => {
  id = validation.validateString(id, "User Id", true);

  const filter = {
    _id: ObjectId.createFromHexString(id),
  };

  let options = {};
  options.projection = {
    _id: 1,
    password: 0,
  };

  const usersCollection = await users();
  const userInfo = await usersCollection.findOne(filter, options);
  if (!userInfo) throw [`Could not find user with id (${id})`];

  return userInfo;
};

const verifyNewUsername = async (username) => {
  let userExists = false;
  try {
    const user = await getUserByUsername(username);
    if (user && user.username === username) {
      userExists = true;
    }
  } catch (e) {}

  if (userExists)
    throw [`Another user is already using username (${username})`];
};

const getUserProfileByUsername = async (username) => {
  username = validation
    .validateString(username, "username", false)
    .toLowerCase();

  const filter = {
    username: username,
  };

  let options = {};
  options.projection = {
    _id: 1,
    password: 0,
  };

  const usersCollection = await users();
  const userInfo = await usersCollection.findOne(filter, options);
  if (!userInfo) throw [`Could not find user with username (${username})`];
  userInfo._id = userInfo._id.toString();
  return userInfo;
};

const getUserComments = async (userId) => {
  userId = validation.validateString(userId, "userId", true);
  const commentsCollection = await comments();
  const commentsOfUser = await commentsCollection
    .find({
      $and: [
        { posterId: ObjectId.createFromHexString(userId) },
        { reportCount: { $lt: 20 } },
      ],
    })
    .toArray();
  if (!commentsOfUser) {
    throw [`Could not get comments of the user with id ${userId}`];
  }
  commentsOfUser.forEach(
    (userComment) => (userComment.spotId = userComment.spotId.toString())
  );
  return commentsOfUser;
};

const getAndUpdateUserFavoriteSpots = async (userId) => {
  userId = validation.validateString(userId, "userId", true);
  const usersCollection = await users();
  let options = {};
  options.projection = {
    _id: 1,
    password: 0,
  };
  const user = await usersCollection.findOne(
    {
      _id: ObjectId.createFromHexString(userId),
    },
    options
  );
  if (!user) {
    throw [`Could not find user with id ${userId}`];
  }
  const favSpots = user.favoriteSpots;
  let userSpots = [];
  let notDeletedFavSpots = [];
  let deletedSpots = [];
  for (let favSpot of favSpots) {
    try {
      let spot = await spotsData.getSpotById(favSpot.toString());
      if (spot.reportCount < 20) {
        spot._id = spot._id.toString();
        userSpots.push(spot);
      }
      notDeletedFavSpots.push(favSpot);
    } catch (e) {
      deletedSpots.push(favSpot);
    }
  }
  const updateObj = { favoriteSpots: notDeletedFavSpots };
  const updatedUser = await usersCollection.findOneAndUpdate(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: updateObj },
    { returnDocument: "after" }
  );
  if (!updatedUser) {
    throw ["Could not update the user successfully"];
  }
  return userSpots;
};

const getUserSubmittedSpots = async (userId) => {
  userId = validation.validateString(userId, "userId", true);
  const spotsCollection = await spots();
  const userSpots = await spotsCollection
    .find({
      $and: [
        { posterId: ObjectId.createFromHexString(userId) },
        { reportCount: { $lt: 20 } },
      ],
    })
    .toArray();
  if (!userSpots) {
    throw [`Could not get spots of the user with id of ${userId}`];
  }
  return userSpots;
};

const getUserRatings = async (userId) => {
  userId = validation.validateString(userId, "userId", true);
  const ratingsCollection = await spotRatings();
  const userRatings = await ratingsCollection
    .find({ posterId: ObjectId.createFromHexString(userId) })
    .toArray();
  if (!userRatings) {
    throw [`Could not get ratings of the user with id of ${userId}`];
  }
  userRatings.forEach(async (rating) => {
    try {
      rating.spot = await spotsData.getSpotById(rating.spotId.toString());
    } catch (e) {
      logger.log(`Spot with id ${rating.spotId} has been deleted.`);
    }
  });
  return userRatings;
};

const getUserContestSubmissions = async (userId) => {
  userId = validation.validateString(userId, "userId", true);
  const constestSubmissionsCollection = await contestSubmissions();
  let userContestSubmissions = await constestSubmissionsCollection
    .find({
      $and: [
        { posterId: ObjectId.createFromHexString(userId) },
        { reportCount: { $lt: 20 } },
      ],
    })
    .toArray();
  if (!userContestSubmissions) {
    throw [`Could not get ratings of user with id of ${userId}`];
  }
  return userContestSubmissions;
};

const putFavoriteSpot = async (userId, spotId) => {
  userId = validation.validateString(userId, "user id", true);
  let userInfo = await getUserProfileById(userId);

  spotId = validation.validateString(spotId, "Spote id", true);
  let spotInfo = await spotsData.getSpotById(spotId);
  const usersCollection = await users();
  if (userInfo.favoriteSpots.indexOf(spotId) == -1) {
    await usersCollection.updateOne(
      {
        _id: ObjectId.createFromHexString(userId),
      },
      {
        $addToSet: {
          favoriteSpots: spotId,
        },
      }
    );
  } else {
    await usersCollection.updateOne(
      {
        _id: ObjectId.createFromHexString(userId),
      },
      {
        $pull: {
          favoriteSpots: spotId,
        },
      }
    );
  }
};

// Report functions for users
const reportSpot = async (userId, spotId) => {
  userId = validation.validateString(userId, "userId", true);
  spotId = validation.validateString(spotId, "spotId", true);
  let userInfo = await getUserProfileById(userId);
  const userSpotReports = userInfo.spotReports;
  if (userSpotReports.includes(spotId)) {
    throw ["User already reported the spot"];
  }
  let spotInfo = await spotsData.getSpotById(spotId);
  const reportCount = spotInfo.reportCount + 1;
  userSpotReports.push(spotId);
  const updatedUserObject = { spotReports: userSpotReports };
  const updatedSpotObject = { reportCount: reportCount };
  let spotsCollection = await spots();
  let usersCollection = await users();
  const updatedUser = await usersCollection.findOneAndUpdate(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: updatedUserObject },
    { returnDocument: "after" }
  );
  const updatedSpot = await spotsCollection.findOneAndUpdate(
    { _id: ObjectId.createFromHexString(spotId) },
    { $set: updatedSpotObject },
    { returnDocument: "after" }
  );
  if (!updatedUser || !updatedSpot) {
    throw ["Failed to report spot"];
  }
};

const reportComment = async (userId, commentId) => {
  userId = validation.validateString(userId, "userId", true);
  commentId = validation.validateString(commentId, "commentId", true);
  let userInfo = await getUserProfileById(userId);
  const userCommentReports = userInfo.commentReports;
  if (userCommentReports.includes(commentId)) {
    throw ["User already reported the comment"];
  }
  let commentInfo = await spotsData.getCommentById(commentId);
  const reportCount = commentInfo.reportCount + 1;
  userCommentReports.push(commentId);
  const updatedUserObject = { commentReports: userCommentReports };
  const updatedCommentObject = { reportCount: reportCount };
  let commentsCollection = await comments();
  let usersCollection = await users();
  const updatedUser = await usersCollection.findOneAndUpdate(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: updatedUserObject },
    { returnDocument: "after" }
  );
  const updatedComment = await commentsCollection.findOneAndUpdate(
    { _id: ObjectId.createFromHexString(commentId) },
    { $set: updatedCommentObject },
    { returnDocument: "after" }
  );
  if (!updatedUser || !updatedComment) {
    throw ["Failed to report comment"];
  }
};

const reportContestSubmission = async (userId, submissionId) => {
  userId = validation.validateString(userId, "userId", true);
  submissionId = validation.validateString(submissionId, "submissionId", true);
  let userInfo = await getUserProfileById(userId);
  const userContestReports = userInfo.contestReports;
  if (userContestReports.includes(submissionId)) {
    throw ["User already reported the contest submission"];
  }
  let submissionInfo = await contestData.getContestSubmissionById(submissionId);
  const reportCount = submissionInfo.reportCount + 1;
  userContestReports.push(submissionId);
  const updatedUserObject = { contestReports: userContestReports };
  const updatedSpotObject = { reportCount: reportCount };
  let contestSubmissionsCollection = await contestSubmissions();
  let usersCollection = await users();
  const updatedUser = await usersCollection.findOneAndUpdate(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: updatedUserObject },
    { returnDocument: "after" }
  );
  const updatedSubmission = await contestSubmissionsCollection.findOneAndUpdate(
    { _id: ObjectId.createFromHexString(submissionId) },
    { $set: updatedSpotObject },
    { returnDocument: "after" }
  );
  if (!updatedUser || !updatedSubmission) {
    throw ["Failed to report contest submission"];
  }
};

const getUsersByKeyword = async (keyword) => {
  keyword = validation.validateString(keyword, "keyword", false);
  const searchRegex = new RegExp("^" + keyword + ".*$", "i");
  const keywordQuery = {
    $or: [
      { firstName: searchRegex },
      { lastName: searchRegex },
      { username: searchRegex },
      {
        $expr: {
          $regexMatch: {
            input: { $concat: ["$firstName", " ", "$lastName"] },
            regex: searchRegex,
          },
        },
      },
    ],
  };
  const options = { projection: { firstName: 1, lastName: 1, username: 1 } };

  const usersCollection = await users();

  const usersFound = await usersCollection
    .find(keywordQuery, options)
    .toArray();
  if (!usersFound) {
    throw ["Could not get the users!"];
  }
  return usersFound;
};



const userData = {
  createUser,
  getUserByUsername,
  authenticateUser,
  verifyNewUsername,
  getUserProfileById,
  updateUserProfile,
  getUserProfileByUsername,
  getUserComments,
  getAndUpdateUserFavoriteSpots,
  getUserSubmittedSpots,
  getUserRatings,
  getUserContestSubmissions,
  putFavoriteSpot,
  reportSpot,
  reportComment,
  reportContestSubmission,
  removeEmail,
  removeBio,
  getUsersByKeyword,
};

export default userData;