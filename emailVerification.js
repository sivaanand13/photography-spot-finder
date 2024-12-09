import nodemailer from 'nodemailer';
import userData from './data/users.js';
import validation from './validation.js';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendVerificationEmail = async (userId, userEmail) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiration = new Date(Date.now() + 1 * 60 * 1000); // OTP expires in 1 minutes
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: userEmail,
    subject: 'Email Verification OTP',
    text: `Your OTP for email verification is ${otp}`
  };

  try {
    await transporter.sendMail(mailOptions);
    const user = await userData.getUserProfileById(userId);
    await userData.updateUserProfile({ _id: userId, otp, otpExpiration, username: user.username });
    return { success: true, otp };
  } catch (error) {
    console.error('Error sending OTP email:', error);
    return { success: false, error: 'Failed to send OTP' };
  }
};

const verifyOtp = async (userId, otp, newEmail) => {
  const user = await userData.getUserProfileById(userId);
  if (user.otp === otp && new Date() < new Date(user.otpExpiration)) {
    const updateData = { _id: userId, isVerified: true, otp: null, otpExpiration: null, username: user.username };
    if (newEmail) {
      updateData.oldEmail = user.email;
      updateData.email = newEmail;
    }
    await userData.updateUserProfile(updateData);
    return { success: true };
  } else {
    await userData.updateUserProfile({ _id: userId, otp: null, otpExpiration: null, username: user.username });
    return { success: false, error: 'Invalid or expired OTP' };
  }
};

export { sendVerificationEmail, verifyOtp };