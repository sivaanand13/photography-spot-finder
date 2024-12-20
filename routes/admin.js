import express from "express";
import { contestData, spotsData } from "../data/index.js";
import validation from "../validation.js";
import logger from "../log.js";
import cloudinary from "../cloudinary/cloudinary.js";
import { MongoCryptKMSRequestNetworkTimeoutError } from "mongodb";
import { contestRatings, spots } from "../config/mongoCollections.js";
import log from "../log.js";
const router = express.Router();

// const isAdmin = (req, res, next) => {
//   if (req.session.user && req.session.user.role === "admin") {
//     return next();
//   }
//   res.status(403).render("error", { message: "Access denied. Admins only!" });
// };

router.get("/", async (req, res) => {
  let errors = [];
  let reportedSpots = [];
  let reportedComments = [];
  let reportedContenstSpots = [];
  if (req.session.errorMessage) {
    errors = errors.concat(req.session.errorMessage);
    delete req.session.errorMessage;
  }

  try {
    reportedSpots = await spotsData.getReportedSpots(req.session.user._id);
  } catch (e) {
    errors = errors.concat(e);
  }

  try {
    reportedComments = await spotsData.getReportedComments(
      req.session.user._id
    );
  } catch (e) {
    errors = errors.concat(e);
  }

  try {
    reportedContenstSpots = await contestData.getReportedContestSubmissions(
      req.session.user._id
    );
  } catch (e) {
    errors = errors.concat(e);
  }

  if (errors.length > 0) {
    logger.log(errors);
    return res.render("admin/adminPanel", {
      user: req.session.user,
      reportedSpots,
      reportedComments,
      reportedContenstSpots,
      errors,
      styles: [`<link rel="stylesheet" href="/public/css/adminPanel.css">`],
    });
  } else {
    return res.render("admin/adminPanel", {
      user: req.session.user,
      reportedSpots,
      reportedComments,
      reportedContenstSpots,
      styles: [`<link rel="stylesheet" href="/public/css/adminPanel.css">`],
    });
  }
});

router.post("/clearSpotReports", async (req, res) => {
  let { spotId } = req.body;
  try {
    spotId = validation.validateString(spotId, "spotId", true);
  } catch (e) {
    req.session.errorMessage = e;
    return res.redirect("/admin");
  }

  try {
    await spotsData.clearSpotReports(spotId, req.session.user._id);
    return res.redirect("/admin");
  } catch (e) {
    req.session.errorMessage = e;
    return res.redirect("/admin");
  }
});

router.post("/deleteReportedSpot", async (req, res) => {
  let { spotId } = req.body;
  try {
    spotId = validation.validateString(spotId, "spotId", true);
  } catch (e) {
    req.session.errorMessage = e;
    return res.redirect("/admin");
  }

  try {
    await spotsData.deleteReportedSpot(spotId, req.session.user._id);
    return res.redirect("/admin");
  } catch (e) {
    req.session.errorMessage = e;
    return res.redirect("/admin");
  }
});

router.post("/clearReportedComment", async (req, res) => {
  let { spotId } = req.body;
  try {
    spotId = validation.validateString(spotId, "spotId", true);
  } catch (e) {
    req.session.errorMessage = e;
    return res.redirect("/admin");
  }
  try {
    await spotsData.clearCommentReports(spotId, req.session.user._id);

    return res.redirect("/admin");
  } catch (e) {
    req.session.errorMessage = e;
    return res.redirect("/admin");
  }
});

router.post("/deleteReportedComment", async (req, res) => {
  let { spotId } = req.body;
  try {
    spotId = validation.validateString(spotId, "spotId", true);
  } catch (e) {
    req.session.errorMessage = e;
    return res.redirect("/admin");
  }
  try {
    await spotsData.deleteReportedComment(spotId, req.session.user._id);

    return res.redirect("/admin");
  } catch (e) {
    req.session.errorMessage = e;
    return res.redirect("/admin");
  }
});

router.post("/clearReportedContestSubmission", async (req, res) => {
  let { spotId } = req.body;
  try {
    spotId = validation.validateString(spotId, "spotId", true);
  } catch (e) {
    req.session.errorMessage = e;
    return res.redirect("/admin");
  }
  try {
    await contestData.clearContestSubmissionReports(
      spotId,
      req.session.user._id
    );
    return res.redirect("/admin");
  } catch (e) {
    req.session.errorMessage = e;
    return res.redirect("/admin");
  }
});

router.post("/deleteReportedContestSubmission", async (req, res) => {
  let { spotId } = req.body;
  try {
    spotId = validation.validateString(spotId, "spotId", true);
  } catch (e) {
    req.session.errorMessage = e;
    return res.redirect("/admin");
  }

  try {
    await contestData.deleteReportedContestSubmission(
      spotId,
      req.session.user._id
    );

    return res.redirect("/admin");
  } catch (e) {
    logger.log(e);
    req.session.errorMessage = e;
    return res.redirect("/admin");
  }
});

export default router;
