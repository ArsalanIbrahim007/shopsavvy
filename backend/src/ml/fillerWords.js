// Words a store adds without saying anything about which product it is:
// colours, warranty and SIM wording, connectivity, and generic "storage".
// "titanium" is included because on watches it is a colour ("Titanium Blue").
//
// Shared by the group-membership fallback in similarityModel.service.js and by
// the extended classifier features, so both agree on what counts as filler.
export const FILLER_WORDS = new Set([
  "black", "white", "blue", "green", "red", "silver", "gold", "grey", "gray", "pink",
  "purple", "orange", "yellow", "titanium", "midnight", "starlight", "graphite", "cream",
  "lavender", "mint", "navy", "sky", "cobalt", "violet", "marine", "phantom",
  "dual", "sim", "esim", "physical", "official", "warranty", "mercantile", "brand", "year",
  "one", "with", "wifi", "wi", "fi", "ram", "rom", "storage", "pta", "non", "approved",
  "new", "box", "pack", "the", "and", "for", "in", "pakistan",
]);
