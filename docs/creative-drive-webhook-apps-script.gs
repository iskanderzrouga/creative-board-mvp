const SECRET_TOKEN = 'replace-with-random-secret';

function doPost(e) {
  try {
    if (!e || !e.parameter || e.parameter.token !== SECRET_TOKEN) {
      return json({ success: false, message: 'Unauthorized' });
    }

    const data = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (!data.parentFolderId) {
      return json({ success: false, message: 'Missing parentFolderId' });
    }

    const parentFolder = DriveApp.getFolderById(data.parentFolderId);
    const folderName = safeName(
      data.folderName ||
      [data.cardId || 'CARD', data.product || '', data.cardTitle || data.brand || 'Untitled', data.angle || data.angleTheme || '']
        .filter(Boolean)
        .join(' - ')
    );
    const folder = getOrCreateFolder(parentFolder, folderName);

    const finalFolderName =
      data.requestedItems &&
      data.requestedItems.finalFolder &&
      data.requestedItems.finalFolder.name
        ? data.requestedItems.finalFolder.name
        : 'Final';
    const finalFolder = getOrCreateFolder(folder, safeName(finalFolderName));

    const briefDocName =
      data.requestedItems &&
      data.requestedItems.briefDoc &&
      data.requestedItems.briefDoc.name
        ? data.requestedItems.briefDoc.name
        : 'Brief';
    const briefDoc = getOrCreateBriefDoc(folder, safeName(briefDocName), data);

    return json({
      success: true,
      folderUrl: folder.getUrl(),
      finalFolderUrl: finalFolder.getUrl(),
      briefDocUrl: briefDoc.getUrl(),
    });
  } catch (err) {
    return json({
      success: false,
      message: err && err.message ? err.message : String(err),
    });
  }
}

function getOrCreateFolder(parentFolder, folderName) {
  const existing = parentFolder.getFoldersByName(folderName);
  if (existing.hasNext()) {
    return existing.next();
  }
  return parentFolder.createFolder(folderName);
}

function getOrCreateBriefDoc(parentFolder, docName, data) {
  const existing = parentFolder.getFilesByName(docName);
  if (existing.hasNext()) {
    const existingFile = existing.next();
    if (existingFile.getMimeType() === MimeType.GOOGLE_DOCS) {
      return DocumentApp.openById(existingFile.getId());
    }
  }

  const doc = DocumentApp.create(docName);
  const file = DriveApp.getFileById(doc.getId());
  parentFolder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  const body = doc.getBody();
  body.clear();
  body.appendParagraph(data.cardTitle || data.folderName || 'Creative Brief').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(`Card ID: ${data.cardId || ''}`);
  body.appendParagraph(`Portfolio: ${data.portfolioName || ''}`);
  body.appendParagraph(`Brand: ${data.brand || ''}`);
  body.appendParagraph(`Product: ${data.product || ''}`);
  body.appendParagraph(`Task Type: ${data.taskTypeName || data.taskTypeId || ''}`);
  body.appendParagraph(`Platform: ${data.platform || ''}`);
  body.appendParagraph(`Funnel Stage: ${data.funnelStage || ''}`);
  body.appendParagraph(`Angle: ${data.angle || data.angleTheme || ''}`);
  body.appendParagraph('');
  body.appendParagraph('Brief').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(stripHtml(data.brief || ''));
  body.appendParagraph('Target Audience').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(stripHtml(data.targetAudience || ''));
  body.appendParagraph('Key Message').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(stripHtml(data.keyMessage || ''));
  body.appendParagraph('Visual Direction').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(stripHtml(data.visualDirection || ''));
  body.appendParagraph('CTA').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(stripHtml(data.cta || ''));
  body.appendParagraph('Reference Links').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(stripHtml(data.referenceLinks || ''));
  body.appendParagraph('Ad Copy').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(stripHtml(data.adCopy || ''));
  body.appendParagraph('Notes').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(stripHtml(data.notes || ''));
  doc.saveAndClose();

  return doc;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function safeName(value) {
  return String(value || 'Untitled')
    .replace(/[\\/:*?"<>|#\[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140) || 'Untitled';
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
