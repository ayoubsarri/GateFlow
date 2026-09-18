function fsRoot_() {
  return 'https://firestore.googleapis.com/v1/projects/' + INAS_EMAIL.PROJECT_ID + '/databases/(default)/documents';
}

function fsHeaders_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
}

function fsDecodeValue_(value) {
  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return value.booleanValue;
  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, 'arrayValue')) return (value.arrayValue.values || []).map(fsDecodeValue_);
  if (Object.prototype.hasOwnProperty.call(value, 'mapValue')) return fsDecodeFields_(value.mapValue.fields || {});
  return null;
}

function fsDecodeFields_(fields) {
  return Object.keys(fields || {}).reduce(function(result, key) {
    result[key] = fsDecodeValue_(fields[key]);
    return result;
  }, {});
}

function fsEncodeValue_(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fsEncodeValue_) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Math.floor(value) === value) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (typeof value === 'object') return { mapValue: { fields: fsEncodeFields_(value) } };
  return { stringValue: String(value) };
}

function fsEncodeFields_(data) {
  return Object.keys(data).reduce(function(result, key) {
    result[key] = fsEncodeValue_(data[key]);
    return result;
  }, {});
}

function fsFetch_(url, options) {
  const request = options || {};
  request.muteHttpExceptions = true;
  request.headers = Object.assign({}, fsHeaders_(), request.headers || {});
  const response = UrlFetchApp.fetch(url, request);
  const status = response.getResponseCode();
  const text = response.getContentText();
  const body = text ? JSON.parse(text) : {};
  if (status < 200 || status >= 300) throw new Error('Firestore ' + status + ': ' + ((body.error && body.error.message) || text));
  return body;
}

function fsGetDocument_(path) {
  const response = UrlFetchApp.fetch(fsRoot_() + '/' + path, { headers: fsHeaders_(), muteHttpExceptions: true });
  if (response.getResponseCode() === 404) return null;
  const status = response.getResponseCode();
  const body = JSON.parse(response.getContentText());
  if (status < 200 || status >= 300) throw new Error('Firestore ' + status + ': ' + ((body.error && body.error.message) || 'read failed'));
  return { id: body.name.split('/').pop(), data: fsDecodeFields_(body.fields || {}) };
}

function fsListCollection_(path) {
  const documents = [];
  let pageToken = '';
  do {
    let url = fsRoot_() + '/' + path + '?pageSize=1000';
    if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
    const body = fsFetch_(url, { method: 'get' });
    (body.documents || []).forEach(function(document) {
      documents.push({ id: document.name.split('/').pop(), data: fsDecodeFields_(document.fields || {}) });
    });
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return documents;
}

function fsPatchDocument_(path, data) {
  const masks = Object.keys(data).map(function(key) { return 'updateMask.fieldPaths=' + encodeURIComponent(key); }).join('&');
  return fsFetch_(fsRoot_() + '/' + path + '?' + masks, {
    method: 'patch',
    contentType: 'application/json',
    payload: JSON.stringify({ fields: fsEncodeFields_(data) })
  });
}

function activeContext_() {
  const event = fsGetDocument_('events/' + INAS_EMAIL.EVENT_ID);
  if (!event) throw new Error('The Firebase event was not found.');
  const rosterId = event.data.activeRosterId;
  const participants = fsListCollection_('events/' + INAS_EMAIL.EVENT_ID + '/rosters/' + rosterId + '/participants');
  const byId = {};
  participants.forEach(function(participant) { byId[participant.id] = participant; });
  return { event: event.data, rosterId: rosterId, participants: participants, byId: byId };
}
