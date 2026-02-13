import {
  KMSClient,
  GenerateMacCommand,
  DecryptCommand,
} from "@aws-sdk/client-kms";

import { createHmac } from "node:crypto";

const REGION = "eu-west-1";
const KEY_ID = "alias/test-imported-hashing-key";

const crossAccountID = "619071313045";

const crossAccountKeyID = "mrk-d9fb88da57e743cb9d26cb6ca4acd8dc";

const hashraw = 'd1cf9999634ea26943df2d6cc8a6da9cb5a6de0ea7b79be7fb68a46a1d0c28d97891e4839bd2582c3559d59341fae8842e4d0ce782bd5007285f3a5a9b8309af';

const hashingKey_512 = Buffer.from(hashraw, 'hex');

const crossAccountKeyAlias = "collies-usecase";

const CROSSS_ACCOUNT_REGION = "ap-south-1";

export const handler = async (event: any): Promise<any> => {
  console.log({ event: JSON.stringify(event, null, 2), msg: "Event received" });
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const message = body?.message;
    const encryptedData = body?.encryptedData;
    const crossAccount = body?.crossAccount;
    const callKMS = body?.callKMS;
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
        if (callKMS) {
          console.log('will call KMS');
          kmsClient = new KMSClient({ region: REGION });
          const command = new GenerateMacCommand({
            KeyId: KEY_ID,
            MacAlgorithm: "HMAC_SHA_512",
            Message: Buffer.from(message, "utf-8"),
          });
  
          const response = await kmsClient.send(command);
  
          return {
            statusCode: 200,
            body: JSON.stringify({
              mac: Buffer.from(response.Mac as Uint8Array).toString("hex"),
            }),
          };
        } else {
          const hmac = createHmac('sha512', hashingKey_512);
          hmac.update(Buffer.from(message, "utf-8"));
          const mac = hmac.digest('hex');
          return {
            statusCode: 200,
            body: JSON.stringify({
              key: mac
            })
          };
        }
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
