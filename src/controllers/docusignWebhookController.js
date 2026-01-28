// src/controllers/docusignWebhookController.js

const { validateService } = require('../utils/serviceValidator');
const { resolvePdfTable } = require('../services/pdfTableResolver');
const supabase = require('../config/supabase');

exports.handleDocusignWebhook = async (req, res) => {
  let service;
  let table;

  try {
    const {
      uuid,
      service: incomingService,
      status,
      signed_pdf_url
    } = req.body;

    if (!uuid) {
      return res.status(400).json({ error: 'UUID is required' });
    }

    /* ---------- SERVICE VALIDATION ---------- */
    service = validateService(incomingService);
    table = resolvePdfTable(service);

    /* ---------- STATUS CHECK ---------- */
    if (status !== 'completed') {
      // ignore non-final events
      return res.json({ success: true, message: 'Event ignored' });
    }

    /* ---------- UPDATE SIGNED STATE ---------- */
    const { error } = await supabase
      .from(table)
      .update({
        is_signed: true,
        signed_pdf_url,
        pdf_status: 'signed'
      })
      .eq('id', uuid);

    if (error) {
      throw error;
    }

    return res.json({ success: true });

  } catch (err) {
    console.error('[DocuSign Webhook]', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
