const nodemailer = require("nodemailer");
require("dotenv").config();

async function testMail() {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: process.env.MAIL_USER,
      subject: "Test email from Node",
      text: "This is a test email",
    });
    console.log("Email sent:", info.response);
  } catch (error) {
    console.error("Email error:", error);
  }
}

testMail();
