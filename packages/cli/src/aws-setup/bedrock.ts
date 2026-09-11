import * as p from "@clack/prompts";

export async function getBedrockCredentials(nonInteractive: boolean) {
  let accessKey = process.env.BEDROCK_ACCESS_KEY;
  let secretKey = process.env.BEDROCK_SECRET_KEY;
  if (nonInteractive && (!accessKey || !secretKey)) {
    throw new Error(
      "Set BEDROCK_ACCESS_KEY and BEDROCK_SECRET_KEY for the deployed application's Bedrock access before running unattended AWS setup.",
    );
  }
  if (!accessKey || !secretKey) {
    p.log.info(
      "The deployed app requires its own Bedrock credentials. The local AWS deployment profile is not passed to ECS.",
    );
    const credentials = await p.group(
      {
        accessKey: () =>
          p.text({
            message: "Bedrock access key ID",
            initialValue: accessKey,
            validate: (value) => (value ? undefined : "Access key is required"),
          }),
        secretKey: () =>
          p.password({
            message: "Bedrock secret access key",
            validate: (value) => (value ? undefined : "Secret key is required"),
          }),
      },
      {
        onCancel: () => {
          p.cancel("Setup cancelled.");
          process.exit(0);
        },
      },
    );
    accessKey = credentials.accessKey;
    secretKey = credentials.secretKey;
  }
  if (!accessKey || !secretKey)
    throw new Error("BEDROCK_ACCESS_KEY and BEDROCK_SECRET_KEY are required");
  return { BEDROCK_ACCESS_KEY: accessKey, BEDROCK_SECRET_KEY: secretKey };
}
