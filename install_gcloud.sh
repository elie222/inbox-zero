#!/bin/bash

URL=https://dl.google.com/dl/cloudsdk/channels/rapid/install_google_cloud_sdk.bash

function download {
  scratch="$(mktemp -d -t tmp.XXXXXXXXXX)" || exit
  script_file="$scratch/install_google_cloud_sdk.bash"

  echo "Downloading Google Cloud SDK install script: $URL"
  curl -# "$URL" > "$script_file" || exit
  chmod 775 "$script_file"

  echo "Running install script from: $script_file"
  "$script_file" "$@"
}

download "$@"
