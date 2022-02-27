import { createTransport } from "nodemailer";
import { config } from "@app/config";

const { EMAIL_SERVICE_URL, EMAIL_CLIENT_ID, EMAIL_CLIENT_KEY } = config;

let transporter: any = {
  verify: () => {},
  sendMail: () => {},
};

if (EMAIL_CLIENT_KEY && EMAIL_CLIENT_ID && EMAIL_SERVICE_URL) {
  try {
    transporter = createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        type: "OAuth2",
        user: EMAIL_SERVICE_URL,
        serviceClient: String(EMAIL_CLIENT_ID),
        privateKey: String(EMAIL_CLIENT_KEY),
      },
    });
  } catch (e) {
    console.error("Email transport creation failed", e);
  }
}

const mailOptions = {
  from: `A11yWatch <${EMAIL_SERVICE_URL}>`,
  to: "myfriend@yahoo.com",
  subject: "Issues found",
  text: "Some issues where found on your website.",
};

const sendMailCallback = (er: any, _info: any, cb?: () => any) => {
  if (er) {
    console.error(er);
  }
  // console.info("Email sent: " + _info?.response);
  if (cb && typeof cb === "function") {
    cb();
  }
};

export { transporter, mailOptions, sendMailCallback };
