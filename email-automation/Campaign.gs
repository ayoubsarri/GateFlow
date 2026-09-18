function qrBlobForAsset_(asset) {
  if (!asset.qrBase64) throw new Error('The private QR image is missing from Firebase.');
  return Utilities.newBlob(Utilities.base64Decode(asset.qrBase64), 'image/png', 'inas-ticket-qr.png');
}

function invitationAsset_(context, participantId, leaseId) {
  const participant = context.byId[participantId];
  if (!participant) throw new Error('Participant not found in the active roster.');
  if (!participant.data.ticketHash) throw new Error('Participant ticket is missing.');
  const ticket = fsGetDocument_('events/' + INAS_EMAIL.EVENT_ID + '/ticketSecrets/' + participant.data.ticketHash);
  if (!ticket || ticket.data.revokedAt) throw new Error('Participant ticket is invalid or revoked.');
  return {
    jobId: participantId,
    leaseId: leaseId || null,
    participantId: participantId,
    name: participant.data.name,
    email: participant.data.email,
    confirmToken: participant.data.ticketHash,
    manualCode: ticket.data.manualCode,
    qrPayload: 'INAS1.' + INAS_EMAIL.EVENT_ID + '.' + ticket.data.rawToken,
    qrBase64: ticket.data.qrBase64
  };
}

function sendInvitation_(asset, recipient) {
  const value = settings_();
  MailApp.sendEmail({
    to: recipient || asset.email,
    subject: invitationSubject_(),
    body: invitationPlainText_(asset),
    htmlBody: buildInvitationHtml_(asset),
    name: value.sender_name || INAS_EMAIL.DEFAULT_SENDER_NAME,
    replyTo: value.reply_to || INAS_EMAIL.DEFAULT_REPLY_TO,
    inlineImages: {
      inasLogo: requireLogoBlob_(),
      ticketQr: qrBlobForAsset_(asset)
    }
  });
}

function activeJobs_(context) {
  const jobs = fsListCollection_('events/' + INAS_EMAIL.EVENT_ID + '/invitationJobs');
  return jobs.filter(function(job) { return Boolean(context.byId[job.id]); });
}

function expireLeases_(context, jobs) {
  const now = Date.now();
  jobs.forEach(function(job) {
    if (job.data.status !== 'leased') return;
    const expires = job.data.leaseUntil ? new Date(job.data.leaseUntil).getTime() : 0;
    if (!expires || expires >= now) return;
    fsPatchDocument_('events/' + INAS_EMAIL.EVENT_ID + '/invitationJobs/' + job.id, {
      status: 'unknown',
      updatedAt: new Date(),
      lastError: 'Previous send ended after leasing; not retried automatically.'
    });
    fsPatchDocument_('events/' + INAS_EMAIL.EVENT_ID + '/rosters/' + context.rosterId + '/participants/' + job.id, {
      inviteStatus: 'unknown',
      updatedAt: new Date()
    });
    job.data.status = 'unknown';
  });
}

function campaignSummary_() {
  const context = activeContext_();
  const jobs = activeJobs_(context);
  expireLeases_(context, jobs);
  const counts = { pending: 0, leased: 0, sent: 0, failed: 0, unknown: 0 };
  jobs.forEach(function(job) {
    const state = job.data.status || 'pending';
    if (Object.prototype.hasOwnProperty.call(counts, state)) counts[state] += 1;
  });
  return { context: context, jobs: jobs, counts: counts, total: jobs.length };
}

function refreshInvitationStats_() {
  const context = activeContext_();
  const accepted = context.participants.filter(function(item) { return item.data.status === 'accepted'; });
  const checkedIn = accepted.filter(function(item) { return Boolean(item.data.checkedInAt); }).length;
  const confirmed = accepted.filter(function(item) { return item.data.confirmationStatus === 'confirmed'; }).length;
  const declined = accepted.filter(function(item) { return item.data.confirmationStatus === 'declined'; }).length;
  const count = function(state) {
    return accepted.filter(function(item) { return (item.data.inviteStatus || 'pending') === state; }).length;
  };
  fsPatchDocument_('events/' + INAS_EMAIL.EVENT_ID + '/stats/summary', {
    accepted: accepted.length,
    confirmed: confirmed,
    declined: declined,
    unconfirmed: Math.max(accepted.length - confirmed - declined, 0),
    checkedIn: checkedIn,
    absent: Math.max(accepted.length - checkedIn, 0),
    invitationPending: accepted.filter(function(item) { return ['pending', 'leased'].indexOf(item.data.inviteStatus || 'pending') >= 0; }).length,
    invitationSent: count('sent'),
    invitationFailed: count('failed'),
    invitationUnknown: count('unknown'),
    updatedAt: new Date()
  });
}

function previewInvitation() {
  const summary = campaignSummary_();
  const job = summary.jobs.find(function(item) { return item.data.status === 'pending'; }) || summary.jobs[0];
  if (!job) throw new Error('There are no invitations in the active roster.');
  const asset = invitationAsset_(summary.context, job.id, null);
  const logo = Utilities.base64Encode(requireLogoBlob_().getBytes());
  const qr = asset.qrBase64;
  const html = buildInvitationHtml_(asset)
    .replace('cid:inasLogo', 'data:image/png;base64,' + logo)
    .replace('cid:ticketQr', 'data:image/png;base64,' + qr);
  Logger.log(html);
  return HtmlService.createHtmlOutput(html).setTitle('INAS Invitation Preview');
}

function sendTestInvitation() {
  const recipient = settings_().test_email || INAS_EMAIL.DEFAULT_TEST_EMAIL;
  const summary = campaignSummary_();
  const job = summary.jobs.find(function(item) { return item.data.status === 'pending'; }) || summary.jobs[0];
  if (!job) throw new Error('There are no invitations in the active roster.');
  const asset = invitationAsset_(summary.context, job.id, null);
  sendInvitation_(asset, recipient);
  appendCampaignLog_('test', recipient, 'sent', 'Participant state unchanged');
  return { ok: true, recipient: recipient, participant: asset.name };
}

function showCampaignStatus() {
  const summary = campaignSummary_();
  const status = {
    total: summary.total,
    pending: summary.counts.pending,
    leased: summary.counts.leased,
    sent: summary.counts.sent,
    failed: summary.counts.failed,
    unknown: summary.counts.unknown,
    quotaLeft: MailApp.getRemainingDailyQuota()
  };
  Logger.log(JSON.stringify(status));
  return status;
}

function approveInvitationCampaign() {
  const summary = campaignSummary_();
  const pending = summary.counts.pending;
  if (!pending) {
    Logger.log('There are no pending invitations.');
    return { ok: false, reason: 'no-pending' };
  }
  PropertiesService.getScriptProperties().setProperty('CAMPAIGN_APPROVED', 'true');
  ensureCampaignTrigger_();
  appendCampaignLog_('approve', '', 'approved', pending + ' pending');
  processInvitationBatch();
  return { ok: true, started: true, pendingAtStart: pending };
}

function leaseJob_(context, job) {
  const leaseId = Utilities.getUuid();
  const attempts = Number(job.data.attempts || 0) + 1;
  fsPatchDocument_('events/' + INAS_EMAIL.EVENT_ID + '/invitationJobs/' + job.id, {
    status: 'leased',
    leaseId: leaseId,
    leaseUntil: new Date(Date.now() + INAS_EMAIL.LEASE_MINUTES * 60 * 1000),
    attempts: attempts,
    updatedAt: new Date(),
    lastError: ''
  });
  fsPatchDocument_('events/' + INAS_EMAIL.EVENT_ID + '/rosters/' + context.rosterId + '/participants/' + job.id, {
    inviteStatus: 'leased',
    updatedAt: new Date()
  });
  return leaseId;
}

function finishJob_(context, jobId, leaseId, state, errorMessage) {
  const current = fsGetDocument_('events/' + INAS_EMAIL.EVENT_ID + '/invitationJobs/' + jobId);
  if (!current || current.data.leaseId !== leaseId) throw new Error('The invitation lease changed before completion.');
  fsPatchDocument_('events/' + INAS_EMAIL.EVENT_ID + '/invitationJobs/' + jobId, {
    status: state,
    leaseId: null,
    leaseUntil: null,
    updatedAt: new Date(),
    sentAt: state === 'sent' ? new Date() : null,
    lastError: errorMessage || ''
  });
  fsPatchDocument_('events/' + INAS_EMAIL.EVENT_ID + '/rosters/' + context.rosterId + '/participants/' + jobId, {
    inviteStatus: state,
    updatedAt: new Date()
  });
}

function processInvitationBatch() {
  if (PropertiesService.getScriptProperties().getProperty('CAMPAIGN_APPROVED') !== 'true') return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const deadline = Date.now() + 4 * 60 * 1000;
    let quota = MailApp.getRemainingDailyQuota();
    if (quota < 1) return;
    const summary = campaignSummary_();
    const pending = summary.jobs.filter(function(job) { return job.data.status === 'pending'; }).slice(0, Math.min(INAS_EMAIL.BATCH_SIZE, quota));
    for (let index = 0; index < pending.length; index += 1) {
      if (Date.now() >= deadline || quota < 1) break;
      const job = pending[index];
      const leaseId = leaseJob_(summary.context, job);
      const asset = invitationAsset_(summary.context, job.id, leaseId);
      let acceptedByGoogle = false;
      try {
        sendInvitation_(asset);
        acceptedByGoogle = true;
        finishJob_(summary.context, job.id, leaseId, 'sent', '');
        appendCampaignLog_('send', asset.email, 'sent', job.id);
      } catch (error) {
        const state = acceptedByGoogle ? 'unknown' : 'failed';
        try {
          finishJob_(summary.context, job.id, leaseId, state, String(error.message || error).slice(0, 450));
        } catch (reportError) {
          // An unreported lease becomes "unknown" after expiry and is never retried automatically.
        }
        appendCampaignLog_('send', asset.email, state, String(error.message || error));
      }
      quota -= 1;
    }
    refreshInvitationStats_();
    const after = campaignSummary_();
    if (after.counts.pending === 0) stopInvitationCampaign();
  } finally {
    lock.releaseLock();
  }
}

function ensureCampaignTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some(function(trigger) { return trigger.getHandlerFunction() === 'processInvitationBatch'; });
  if (!exists) ScriptApp.newTrigger('processInvitationBatch').timeBased().everyMinutes(5).create();
}

function stopInvitationCampaign() {
  PropertiesService.getScriptProperties().setProperty('CAMPAIGN_APPROVED', 'false');
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'processInvitationBatch') ScriptApp.deleteTrigger(trigger);
  });
  Logger.log('Campaign stopped.');
  return { ok: true, stopped: true };
}

function rotateAndResendInvitation(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) throw new Error('Pass the participant email: rotateAndResendInvitation("name@example.com")');
  const context = activeContext_();
  const participant = context.participants.find(function(item) { return String(item.data.emailNormalized || '').toLowerCase() === email; });
  if (!participant) throw new Error('Participant not found.');

  const oldHash = participant.data.ticketHash;
  let replacement = null;
  for (let slot = 1; slot <= 2; slot += 1) {
    const candidateId = participant.id + '-' + ('0' + slot).slice(-2);
    const candidate = fsGetDocument_('events/' + INAS_EMAIL.EVENT_ID + '/replacementTickets/' + candidateId);
    if (candidate && candidate.data.status === 'available') {
      replacement = { id: candidateId, data: candidate.data };
      break;
    }
  }
  if (!replacement) throw new Error('No unused replacement QR remains for this participant.');
  const ticketHash = replacement.data.ticketHash;
  const manualCode = replacement.data.manualCode;
  fsPatchDocument_('events/' + INAS_EMAIL.EVENT_ID + '/ticketSecrets/' + oldHash, { revokedAt: new Date(), revokeReason: 'Manual resend' });
  fsPatchDocument_('events/' + INAS_EMAIL.EVENT_ID + '/ticketSecrets/' + ticketHash, {
    participantId: participant.id,
    rawToken: replacement.data.rawToken,
    manualCode: manualCode,
    manualCodeNormalized: replacement.data.manualCodeNormalized,
    qrBase64: replacement.data.qrBase64,
    createdAt: new Date(),
    revokedAt: null
  });
  fsPatchDocument_('events/' + INAS_EMAIL.EVENT_ID + '/replacementTickets/' + replacement.id, {
    status: 'used',
    usedAt: new Date()
  });
  fsPatchDocument_('events/' + INAS_EMAIL.EVENT_ID + '/rosters/' + context.rosterId + '/participants/' + participant.id, {
    ticketHash: ticketHash,
    inviteStatus: 'pending',
    updatedAt: new Date()
  });
  fsPatchDocument_('events/' + INAS_EMAIL.EVENT_ID + '/invitationJobs/' + participant.id, {
    participantId: participant.id,
    status: 'pending',
    attempts: 0,
    leaseId: null,
    leaseUntil: null,
    lastError: '',
    updatedAt: new Date()
  });
  context.byId[participant.id].data.ticketHash = ticketHash;
  const leaseId = leaseJob_(context, { id: participant.id, data: { attempts: 0 } });
  const asset = invitationAsset_(context, participant.id, leaseId);
  let acceptedByGoogle = false;
  try {
    sendInvitation_(asset);
    acceptedByGoogle = true;
    finishJob_(context, participant.id, leaseId, 'sent', '');
    refreshInvitationStats_();
    appendCampaignLog_('rotate-resend', asset.email, 'sent', participant.id);
    return { ok: true, recipient: asset.email, participant: asset.name };
  } catch (error) {
    const state = acceptedByGoogle ? 'unknown' : 'failed';
    try { finishJob_(context, participant.id, leaseId, state, String(error.message || error).slice(0, 450)); } catch (ignored) {}
    refreshInvitationStats_();
    appendCampaignLog_('rotate-resend', asset.email, state, String(error.message || error));
    throw error;
  }
}
