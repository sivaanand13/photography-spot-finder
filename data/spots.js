import { spots } from "../config/mongoCollections.js";
import validation from "../validation.js";

// Function to get all spots which have number of reports less than 20, to be displayed on the spots list page
const getAllSpots = async () => {
  const spotsCollection = await spots();
  const allSpotsList = await spotsCollection
    .find({ reportCount: { $lt: 20 } })
    .toArray();
  if (!allSpotsList) {
    throw ["Could not get all spots"];
  }
  return allSpotsList;
};

// Function to get spots by rating range (inclusive). Takes two ratings as input minRating and maxRating
// returns a list of all spots in the inclusive range
const getAllSpotsByRating = async (minRating, maxRating) => {
  validation.validateRating(minRating);
  validation.validateRating(maxRating);
  if (minRating > maxRating) {
    throw ["minRating cannot be greater than maxRating"];
  }
  const spotsCollection = await spots();
  const spotsRatingList = await spotsCollection
    .find({
      $and: [
        { avgRating: { $gte: minRating } },
        { avgRating: { $lte: maxRating } },
        { reportCount: { $lt: 20 } },
      ],
    })
    .toArray();
  if (!spotsRatingList) {
    throw ["Could not get spots in the specified rating range"];
  }
  return spotsRatingList;
};

export default { getAllSpots };
