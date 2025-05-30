const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

function sendBookingEmail({ name, email, phone, location, message }) {
  const mailOptions = {
    from: email,
    to: process.env.MAIL_USER,
    subject: `New Booking from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nLocation: ${location}\nMessage: ${message}`,
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { sendBookingEmail };
