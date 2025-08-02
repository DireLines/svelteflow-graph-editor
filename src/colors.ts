export const getBackgroundColor = (colorMode) => {
  if (colorMode === "dark") {
    return "#1e1e1e";
  } else {
    return "#fff";
  }
};

export const getTextColor = (colorMode) => {
  if (colorMode === "dark") {
    return "#f8f8f8";
  } else {
    return "#000";
  }
};
