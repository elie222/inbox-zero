export function truncate(str: string, length: number) {
  return str.length > length ? str.slice(0, length) + "..." : str;
}

export function generalizeSubject(subject = "") {
  // replace numbers to make subject more generic
  // also removes [], () ,and words that start with #
  const regex =
    /(\b\d+(\.\d+)?(-\d+(\.\d+)?)?(\b|[A-Za-z])|\[.*?\]|\(.*?\)|\b#\w+)/g;

  // remove any words that contain numbers
  const regexRemoveNumberWords = /\b\w*\d\w*\b/g;

  return subject.replaceAll(regexRemoveNumberWords, "").replaceAll(regex, "");
}
