// ===== lib/email.js - Email sending via Nodemailer =====
// Priority: DB smtp_config > .env SMTP_* vars. Graceful if unconfigured.

const nodemailer = require('nodemailer');

let _transport = null;
let _config = null; // cached config from DB

async function _loadConfig() {
  // Try DB first
  try {
    const db = require('../db.js');
    const smtpRows = db.readSmtpConfig && db.readSmtpConfig();
    if (smtpRows && smtpRows.length > 0) {
      const cfg = {};
      for (const r of smtpRows) {
        cfg[r._key] = r._value;
      }
      if (cfg.host && cfg.user) {
        _config = {
          host: cfg.host,
          port: parseInt(cfg.port) || 587,
          user: cfg.user,
          pass: cfg.pass || '',
          fromName: cfg.fromName || '校园墙'
        };
        return;
      }
    }
  } catch (e) {
    // DB read failed, fall through to env
  }
  // Fall back to .env
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    _config = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS || '',
      fromName: process.env.SMTP_FROM || 'noreply@campuswall.com'
    };
    return;
  }
  _config = null;
}

function _buildTransport() {
  if (!_config) return null;
  return nodemailer.createTransport({
    host: _config.host,
    port: _config.port,
    secure: _config.port === 465,
    auth: {
      user: _config.user,
      pass: _config.pass
    }
  });
}

/**
 * Send an email.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML body content
 * @returns {Promise<{ok: boolean, msg: string, code?: string}>}
 */
async function sendEmail(to, subject, html) {
  if (!_config) {
    await _loadConfig();
  }
  if (!_config) {
    return { ok: false, msg: '邮箱服务未配置', code: 'EMAIL_NOT_CONFIGURED' };
  }
  if (!_transport) {
    _transport = _buildTransport();
  }
  if (!_transport) {
    return { ok: false, msg: '邮箱服务未配置', code: 'EMAIL_NOT_CONFIGURED' };
  }
  try {
    await _transport.sendMail({
      from: '"' + (_config.fromName || '校园墙') + '" <' + _config.user + '>',
      to,
      subject,
      html
    });
    return { ok: true, msg: '邮件已发送' };
  } catch (e) {
    console.error('[email] send failed:', e.message);
    return { ok: false, msg: '邮件发送失败，请稍后重试', code: 'EMAIL_SEND_FAILED' };
  }
}

/**
 * Reset cached config + transport (called after admin updates SMTP config).
 */
function resetTransport() {
  _config = null;
  _transport = null;
}

/**
 * Test an SMTP connection with the given config (does not use cached config/transport).
 * @param {object} opts - { host, port, user, pass }
 * @returns {Promise<{ok: boolean, msg: string}>}
 */
async function testTransport(opts) {
  if (!opts || !opts.host || !opts.user) {
    return { ok: false, msg: '配置不完整' };
  }
  const transport = nodemailer.createTransport({
    host: opts.host,
    port: parseInt(opts.port) || 587,
    secure: parseInt(opts.port) === 465,
    auth: { user: opts.user, pass: opts.pass || '' }
  });
  try {
    await transport.verify();
    return { ok: true, msg: '连接成功' };
  } catch (e) {
    return { ok: false, msg: '连接失败：' + e.message };
  }
}

module.exports = { sendEmail, resetTransport, testTransport };

