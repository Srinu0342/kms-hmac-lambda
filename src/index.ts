import {
  KMSClient,
  GenerateMacCommand,
  DecryptCommand,
} from "@aws-sdk/client-kms";

const REGION = "eu-west-1";
const KEY_ID = "alias/sha-test-key";

const crossAccountID = "619071313045";

const crossAccountKeyID = "mrk-d9fb88da57e743cb9d26cb6ca4acd8dc";

const crossAccountKeyAlias = "collies-usecase";

const CROSSS_ACCOUNT_REGION = "ap-south-1";

export const handler = async (event: any): Promise<any> => {
  console.log({ event: JSON.stringify(event, null, 2), msg: "Event received" });
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const message = body?.message;
    const encryptedData = body?.encryptedData;
    const crossAccount = body?.crossAccount;
    const partner = body?.partner;

    if (encryptedData) {
      console.log({ encryptedData, partner });

      const ciphertextBuffer = Buffer.from(encryptedData, "base64");

      const command = new DecryptCommand({
        KeyId: `alias/${partner}`,
        CiphertextBlob: ciphertextBuffer,
        EncryptionAlgorithm: "RSAES_OAEP_SHA_256",
      });

      const kmsClient = new KMSClient({ region: REGION });

      const response = await kmsClient.send(command);

      return {
        statusCode: 200,
        body: JSON.stringify({
          mac: Buffer.from(response.Plaintext as Uint8Array).toString("utf-8"),
        }),
      };
    }

    if (message) {
      console.log({ message, crossAccount });

      let kmsClient: KMSClient;

      if (!crossAccount) {
        kmsClient = new KMSClient({ region: REGION });
        const command = new GenerateMacCommand({
          KeyId: KEY_ID,
          MacAlgorithm: "HMAC_SHA_512",
          Message: Buffer.from(message),
        });

        const response = await kmsClient.send(command);

        return {
          statusCode: 200,
          body: JSON.stringify({
            mac: Buffer.from(response.Mac as Uint8Array).toString("hex"),
          }),
        };
      } else {
        kmsClient = new KMSClient({
          region: CROSSS_ACCOUNT_REGION,
        });

        const command = new GenerateMacCommand({
          KeyId: `arn:aws:kms:${CROSSS_ACCOUNT_REGION}:${crossAccountID}:alias/${crossAccountKeyAlias}`,
          MacAlgorithm: "HMAC_SHA_512",
          Message: Buffer.from(message),
        });

        const response = await kmsClient.send(command);

        return {
          statusCode: 200,
          body: JSON.stringify({
            mac: Buffer.from(response.Mac as Uint8Array).toString("hex"),
          }),
        };
      }
    }

    return {
      statusCode: 400,
      body: JSON.stringify({
        error: `Missing 'message' or 'encryptedData' in request body.`,
      }),
    };
  } catch (error: any) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message ?? "Internal Server Error" }),
    };
  }
};
