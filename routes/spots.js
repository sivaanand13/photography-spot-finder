import { spotsData } from "../data/index.js";
import express from "express";
import validation from "../validation.js";
import logger from "../log.js";
import cloudinary from "../cloudinary/cloudinary.js";
import { MongoCryptKMSRequestNetworkTimeoutError } from "mongodb";
import { spots } from "../config/mongoCollections.js";
const router = express.Router();

router
  .route("/edit/:spotId")
  .get(async (req, res) => {
    let errors = [];

    let spotId;
    let spotInfo;
    try {
      spotId = validation.validateString(req.params.spotId);
    } catch (e) {
      logger.log(e);
      errors = errors.concat(e);
    }

    try {
      spotInfo = await spotsData.getSpotById(spotId);
      if (
        !req.session.user ||
        req.session.user._id.toString() !== spotInfo.posterId.toString()
      ) {
        errors.push(`You tried to modify an spot that doesn't belong to you!`);
      }
    } catch (e) {
      logger.log(e);
      errors = errors.concat(e);
    }

    if (errors.length > 0) {
      logger.log(
        `Invalid session (${req.sessionID}) tried to modify ${spotId}`
      );
      req.session.authorizationErrors = errors;
      return res.status(401).redirect("/users/profile");
    }

    logger.log("Rendering edit spot for :", spotId);
    logger.log(spotInfo);

    const publicSpot = {
      _id: spotInfo._id.toString(),
      spotName: spotInfo.name,
      spotDescription: spotInfo.description,
      spotAccessibility: spotInfo.accessibility,
      spotDescription: spotInfo.description,
      spotAccessibility: spotInfo.accessibility,
      spotBestTimes: spotInfo.bestTimes.join(","),
      spotTags: spotInfo.tags.join(","),
      spotImages: spotInfo.images,
      spotAddress: spotInfo.address,
      spotLongitude: spotInfo.location.coordinates[0],
      spotLatitude: spotInfo.location.coordinates[1],
    };
    res.render("spots/editSpot", {
      user: req.session.user,
      styles: [
        `<link rel="stylesheet" href="/public/css/addSpot.css">`,
        `<link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet">`,
        `<link rel="stylesheet" href="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.1-dev/mapbox-gl-geocoder.css" type="text/css">`,
      ],
      scripts: [
        `<script id="search-js" defer src="https://api.mapbox.com/search-js/v1.0.0-beta.21/web.js"></script>`,
        `<script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>`,
        `<script src="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.1-dev/mapbox-gl-geocoder.min.js"></script>`,
        `<script src="https://upload-widget.cloudinary.com/latest/global/all.js"></script>`,
      ],
      apikey: process.env.MAPBOX_API_TOKEN,
      spot: publicSpot,
    });
  })
  .put(async (req, res) => {
    const newSpot = {
      spotName: req.body.spotName,
      spotDescription: req.body.spotDescription,
      spotAccessibility: req.body.spotAccessibility,
      spotBestTimes: req.body.spotBestTimes,
      spotTags: req.body.spotTags,
      spotImages: req.body.spotImages,
      spotLongitude: req.body.spotLongitude,
      spotAddress: req.body.spotAddress,
      spotLatitude: req.body.spotLatitude,
      geometrySave: req.body.geometrySave,
    };
    let errors = [];

    let spotId;
    let spotInfo;
    try {
      spotId = validation.validateString(req.params.spotId);
    } catch (e) {
      logger.log(e);
      errors = errors.concat(e);
    }

    try {
      spotInfo = await spotsData.getSpotById(spotId);
      if (
        !req.session.user ||
        req.session.user._id.toString() !== spotInfo.posterId.toString()
      ) {
        errors.push(`You tried to modify an spot that doesn't belong to you!`);
      }
    } catch (e) {
      logger.log(e);
      errors = errors.concat(e);
    }

    if (errors.length > 0) {
      logger.log(
        `Invalid session (${req.sessionID}) tried to modify ${spotId}`
      );
      req.session.authErrors = errors;
      return res.status(401).redirect("/users/profile");
    }

    logger.log("Trying to create new spot:");
    logger.log(newSpot);
    try {
      newSpot.spotName = validation.validateString(newSpot.spotName);
    } catch (e) {
      errors.error_spotName = [`Spot Name must not be blank or just spaces!`];
    }

    try {
      newSpot.spotDescription = validation.validateString(
        newSpot.spotDescription
      );
    } catch (e) {
      errors.error_spotDescription = [
        `Spot Description must not be blank or just spaces!`,
      ];
    }

    try {
      newSpot.spotAccessibility = validation.validateString(
        newSpot.spotAccessibility
      );
    } catch (e) {
      errors.error_spotAccessibility = [
        `Spot Accessibility  must not be blank or just spaces!`,
      ];
    }

    let bestTimes = newSpot.spotBestTimes.split(",");

    if (bestTimes.length == 0) {
      errors.error_spotBestTimes = "Must provide at least one tag for spot";
    }
    let tagErrors = [];
    for (const tagI in bestTimes) {
      try {
        bestTimes[tagI] = validation.validateString(bestTimes[tagI]);
      } catch (e) {
        tagErrors.push(
          `Invalid best time: "${bestTimes[tagI]}". A best time cannot be blank or just spaces.`
        );
      }
    }
    if (tagErrors.length > 0) {
      errors.error_spotBestTimes = tagErrors;
    } else {
      newSpot.spotBestTimes = bestTimes;
    }

    if (
      typeof newSpot.spotTags === "string" &&
      newSpot.spotTags.trim().length !== 0
    ) {
      const tags = newSpot.spotTags.split(",");
      tagErrors = [];
      for (const tagI in tags) {
        try {
          tags[tagI] = validation.validateString(tags[tagI]);
        } catch (e) {
          tagErrors.push(
            `Invalid tag: "${tags[tagI]}". A tag cannot be blank or just spaces.`
          );
        }
      }
      if (Array.isArray(tags) && tags.length > 5) {
        tagErrors.push(`A maximum of five tags is allowed`);
      }
      if (tagErrors.length > 0) {
        errors.error_spotTags = tagErrors;
      } else {
        newSpot.spotTags = tags;
      }
    } else {
      newSpot.spotTags = [];
    }

    try {
      validation.validateCoordinates(
        newSpot.spotLongitude,
        newSpot.spotLatitude
      );
      newSpot.spotLatitude = parseFloat(newSpot.spotLatitude);
      newSpot.spotLongitude = parseFloat(newSpot.spotLongitude);
      newSpot.spotAddress = validation.validateString(newSpot.spotAddress);
    } catch (e) {
      logger.log("error", e);
      errors.error_spotLocation = [
        `Please use the map above to select the location!`,
      ];
    }

    try {
      newSpot.spotImages = JSON.parse(newSpot.spotImages);
    } catch (e) {
      errors.error_spotImages = [
        `Please upload at least one image of the spot!`,
      ];
    }
    if (Array.isArray(newSpot.spotImages) && newSpot.spotImages.length > 3) {
      errors.error_spotImages = [`Please upload a maximum of three images!`];
    }

    try {
      newSpot.geometrySave = JSON.stringify(JSON.parse(newSpot.geometrySave));
    } catch (e) {}

    if (Object.keys(errors).length > 0) {
      if (!errors.error_spotImages) {
        for (const image of newSpot.spotImages) {
          try {
            await cloudinary.uploader.destroy(image.public_id);
          } catch (e) {}
        }
      }
      if (!errors.error_spotImages) {
        errors.error_spotImages = [`Please re-upload your images.`];
      }
      logger.log(errors);

      return res.status(400).render("spots/editSpot", {
        user: req.session.user,
        styles: [
          `<link rel="stylesheet" href="/public/css/addSpot.css">`,
          `<link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" >`,
          `<link rel="stylesheet" href="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.1-dev/mapbox-gl-geocoder.css" type="text/css">`,
        ],
        scripts: [
          `<script id="search-js" defer src="https://api.mapbox.com/search-js/v1.0.0-beta.21/web.js"></script>`,
          `<script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>`,
          `<script src="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.1-dev/mapbox-gl-geocoder.min.js"></script>`,
          `<script src="https://upload-widget.cloudinary.com/latest/global/all.js"></script>`,
        ],
        apikey: process.env.MAPBOX_API_TOKEN,
        errors,
        spot: newSpot,
      });
    }
    try {
      const spotDiscardedImages = JSON.parse(req.body.spotDiscardedImages);
      for (const public_id of spotDiscardedImages) {
        try {
          cloudinary.uploader.destroy(public_id);
        } catch (e) {}
      }
    } catch (e) {}

    const spot = {
      name: newSpot.spotName,
      location: {
        type: "Point",
        coordinates: [newSpot.spotLongitude, newSpot.spotLatitude],
      },
      address: newSpot.spotAddress,
      description: newSpot.spotDescription,
      accessibility: newSpot.spotAccessibility,
      bestTimes: newSpot.spotBestTimes,
      images: newSpot.spotImages,
      tags: newSpot.spotTags,
    };
    logger.log("Attempting to insert spot");
    logger.log(spot);
    try {
      await spotsData.updateSpot(spotId, req.session.user._id.toString(), spot);
      //TODO reroute to spot details
      return res.status(200);
    } catch (e) {
      logger.log(e);
      return res.status(500).render("spots/editSpot", {
        user: req.session.user,
        styles: [
          `<link rel="stylesheet" href="/public/css/addSpot.css">`,
          `<link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" >`,
          `<link rel="stylesheet" href="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.1-dev/mapbox-gl-geocoder.css" type="text/css">`,
        ],
        scripts: [
          `<script id="search-js" defer src="https://api.mapbox.com/search-js/v1.0.0-beta.21/web.js"></script>`,
          `<script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>`,
          `<script src="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.1-dev/mapbox-gl-geocoder.min.js"></script>`,
          `<script src="https://upload-widget.cloudinary.com/latest/global/all.js"></script>`,
        ],
        apikey: process.env.MAPBOX_API_TOKEN,
        errors: {
          server_errors: ["Spot submission failed! Please try again."],
          error_spotImages: [`Please re-upload your images.`],
        },
        spot: newSpot,
      });
    }
  });

router
  .route("/new")
  .get(async (req, res) => {
    res.render("spots/addSpot", {
      user: req.session.user,
      styles: [
        `<link rel="stylesheet" href="/public/css/addSpot.css">`,
        `<link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet">`,
        `<link rel="stylesheet" href="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.1-dev/mapbox-gl-geocoder.css" type="text/css">`,
      ],
      scripts: [
        `<script id="search-js" defer src="https://api.mapbox.com/search-js/v1.0.0-beta.21/web.js"></script>`,
        `<script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>`,
        `<script src="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.1-dev/mapbox-gl-geocoder.min.js"></script>`,
        `<script src="https://upload-widget.cloudinary.com/latest/global/all.js"></script>`,
      ],
      apikey: process.env.MAPBOX_API_TOKEN,
    });
  })
  .post(async (req, res) => {
    const newSpot = {
      spotName: req.body.spotName,
      spotDescription: req.body.spotDescription,
      spotAccessibility: req.body.spotAccessibility,
      spotBestTimes: req.body.spotBestTimes,
      spotTags: req.body.spotTags,
      spotImages: req.body.spotImages,
      spotLongitude: req.body.spotLongitude,
      spotAddress: req.body.spotAddress,
      spotLatitude: req.body.spotLatitude,
      geometrySave: req.body.geometrySave,
    };
    const errors = {};
    logger.log("Trying to create new spot:");
    logger.log(newSpot);
    try {
      newSpot.spotName = validation.validateString(newSpot.spotName);
    } catch (e) {
      errors.error_spotName = [`Spot Name must not be blank or just spaces!`];
    }

    try {
      newSpot.spotDescription = validation.validateString(
        newSpot.spotDescription
      );
    } catch (e) {
      errors.error_spotDescription = [
        `Spot Description must not be blank or just spaces!`,
      ];
    }

    try {
      newSpot.spotAccessibility = validation.validateString(
        newSpot.spotAccessibility
      );
    } catch (e) {
      errors.error_spotAccessibility = [
        `Spot Accessibility  must not be blank or just spaces!`,
      ];
    }

    let bestTimes = newSpot.spotBestTimes.split(",");

    if (bestTimes.length == 0) {
      errors.error_spotBestTimes = "Must provide at least one tag for spot";
    }
    let tagErrors = [];
    for (const tagI in bestTimes) {
      try {
        bestTimes[tagI] = validation.validateString(bestTimes[tagI]);
      } catch (e) {
        tagErrors.push(
          `Invalid best time: "${bestTimes[tagI]}". A best time cannot be blank or just spaces.`
        );
      }
    }
    if (tagErrors.length > 0) {
      errors.error_spotBestTimes = tagErrors;
    } else {
      newSpot.spotBestTimes = bestTimes;
    }

    if (
      typeof newSpot.spotTags === "string" &&
      newSpot.spotTags.trim().length !== 0
    ) {
      const tags = newSpot.spotTags.split(",");
      tagErrors = [];
      for (const tagI in tags) {
        try {
          tags[tagI] = validation.validateString(tags[tagI]);
        } catch (e) {
          tagErrors.push(
            `Invalid tag: "${tags[tagI]}". A tag cannot be blank or just spaces.`
          );
        }
      }
      if (Array.isArray(tags) && tags.length > 5) {
        tagErrors.push(`A maximum of five tags is allowed`);
      }
      if (tagErrors.length > 0) {
        errors.error_spotTags = tagErrors;
      } else {
        newSpot.spotTags = tags;
      }
    } else {
      newSpot.spotTags = [];
    }

    try {
      validation.validateCoordinates(
        newSpot.spotLongitude,
        newSpot.spotLatitude
      );
      newSpot.spotLatitude = parseFloat(newSpot.spotLatitude);
      newSpot.spotLongitude = parseFloat(newSpot.spotLongitude);
      newSpot.spotAddress = validation.validateString(newSpot.spotAddress);
    } catch (e) {
      logger.log("error", e);
      errors.error_spotLocation = [
        `Please use the map above to select the location!`,
      ];
    }

    try {
      newSpot.spotImages = JSON.parse(newSpot.spotImages);
    } catch (e) {
      errors.error_spotImages = [
        `Please upload at least one image of the spot!`,
      ];
    }
    if (Array.isArray(newSpot.spotImages) && newSpot.spotImages.length > 3) {
      errors.error_spotImages = [`Please upload a maximum of three images!`];
    }

    try {
      newSpot.geometrySave = JSON.stringify(JSON.parse(newSpot.geometrySave));
    } catch (e) {}

    if (Object.keys(errors).length > 0) {
      if (!errors.error_spotImages) {
        for (const image of newSpot.spotImages) {
          try {
            await cloudinary.uploader.destroy(image.public_id);
          } catch (e) {}
        }
      }
      if (!errors.error_spotImages) {
        errors.error_spotImages = [`Please re-upload your images.`];
      }
      logger.log(errors);

      return res.status(400).render("spots/addSpot", {
        user: req.session.user,
        styles: [
          `<link rel="stylesheet" href="/public/css/addSpot.css">`,
          `<link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" >`,
          `<link rel="stylesheet" href="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.1-dev/mapbox-gl-geocoder.css" type="text/css">`,
        ],
        scripts: [
          `<script id="search-js" defer src="https://api.mapbox.com/search-js/v1.0.0-beta.21/web.js"></script>`,
          `<script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>`,
          `<script src="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.1-dev/mapbox-gl-geocoder.min.js"></script>`,
          `<script src="https://upload-widget.cloudinary.com/latest/global/all.js"></script>`,
        ],
        apikey: process.env.MAPBOX_API_TOKEN,
        errors,
        spot: newSpot,
      });
    }
    try {
      const spotDiscardedImages = JSON.parse(req.body.spotDiscardedImages);
      for (const public_id of spotDiscardedImages) {
        try {
          cloudinary.uploader.destroy(public_id);
        } catch (e) {}
      }
    } catch (e) {}

    const spot = {
      name: newSpot.spotName,
      location: {
        type: "Point",
        coordinates: [newSpot.spotLongitude, newSpot.spotLatitude],
      },
      address: newSpot.spotAddress,
      description: newSpot.spotDescription,
      accessibility: newSpot.spotAccessibility,
      bestTimes: newSpot.spotBestTimes,
      images: newSpot.spotImages,
      tags: newSpot.spotTags,
      posterId: req.session.user._id,
      createdAt: new Date(),
    };
    logger.log("Attempting to insert spot");
    logger.log(spot);
    try {
      await spotsData.createSpot(
        spot.name,
        spot.location,
        spot.address,
        spot.description,
        spot.accessibility,
        spot.bestTimes,
        spot.images,
        spot.tags,
        spot.posterId,
        spot.createdAt
      );
      //TODO re-route to spot details
      return res.status(200);
    } catch (e) {
      logger.log(e);
      return res.status(500).render("spots/addSpot", {
        user: req.session.user,
        styles: [
          `<link rel="stylesheet" href="/public/css/addSpot.css">`,
          `<link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" >`,
          `<link rel="stylesheet" href="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.1-dev/mapbox-gl-geocoder.css" type="text/css">`,
        ],
        scripts: [
          `<script id="search-js" defer src="https://api.mapbox.com/search-js/v1.0.0-beta.21/web.js"></script>`,
          `<script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>`,
          `<script src="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.1-dev/mapbox-gl-geocoder.min.js"></script>`,
          `<script src="https://upload-widget.cloudinary.com/latest/global/all.js"></script>`,
        ],
        apikey: process.env.MAPBOX_API_TOKEN,
        errors: {
          server_errors: ["Spot submission failed! Please try again."],
          error_spotImages: [`Please re-upload your images.`],
        },
        spot: newSpot,
      });
    }
  });

router.route("/allSpots").get(async (req, res) => {
  try {
    const allSpots = await spotsData.getAllSpots();
    res.render("spots/allSpots", {
      spots: allSpots,
      user: req.session.user,
    });
  } catch (error) {
    res.status(500).json({ error: "Could not fetch spots." });
  }
});

router.route("/search").get(async (req, res) => {
  try {
    const keyword = req.query.keyword?.trim() || "";
    let spots;

    if (!keyword) {
      spots = await spotsData.getAllSpots();
    } else {
      spots = await spotsData.getSpotsByKeywordSearch(keyword);
    }
    res.render("spots/allSpots", {
      spots: spots,
      user: req.session.user,
      keyword: keyword,
    });
  } catch (error) {
    res.status(500).json({ error: "Could not perform search." });
  }
});

router.route("/searchbytags").get(async (req, res) => {
  try {
    const tagString = req.query.tags;
    if (!tagString) {
      return res.status(400).json({ error: "incorrect input, not provided" });
    }

    const tagsArr = tagString
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tagsArr.length === 0) {
      return res.status(400).json({ error: "tags array is empty" });
    }

    const spotList = await spotsData.getSpotsByTags(tagsArr);
    res.render("spots/allSpots", {
      spots: spotList,
      user: req.session.user,
      tags: tagsArr,
    });
  } catch (e) {
    res.status(500).json({ error: e });
  }
});

router.route("/searchbyrating").get(async (req, res) => {
  try {
    const minRating = parseFloat(req.query.minRating);
    const maxRating = parseFloat(10);

    if (isNaN(minRating) || isNaN(maxRating)) {
      return res
        .status(400)
        .json({ error: "invalid min and max rating values provided" });
    }

    const spotList = await spotsData.getSpotsByRating(minRating, maxRating);

    res.render("spots/allSpots", {
      spots: spotList,
      user: req.session.user,
      minRating: minRating,
      maxRating: maxRating,
    });
  } catch (e) {
    res.status(400).json({ error: "Invalid rating values provided" });
  }
});

router.route("/searchbytimerange").get(async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
      return res
        .status(400)
        .json({ error: "Invalid date format. Use YYYY-MM-DD." });
    }

    if (parsedStartDate >= parsedEndDate) {
      return res
        .status(400)
        .json({ error: "Start date must be earlier than end date." });
    }

    const spotsInDateRange = await spotsData.getSpotsByDateRange(
      parsedStartDate,
      parsedEndDate
    );

    res.render("spots/allSpots", {
      spots: spotsInDateRange,
      user: req.session.user,
      startDate: parsedStartDate.toISOString().split("T")[0],
      endDate: parsedEndDate.toISOString().split("T")[0],
    });
  } catch (error) {
    res.status(500).json({ error: "Could not fetch spots by date range." });
  }
});

export default router;
