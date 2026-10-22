import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { Icon } from './components/Icon';
import { ActivityLog } from './features/invoice-review/ActivityLog';
import { DocumentViewer, type DocumentAsset } from './features/invoice-review/DocumentViewer';
import { FieldReviewPanel } from './features/invoice-review/FieldReviewPanel';
import {
  countStatuses,
  createInitialReviewState,
  createMockFields,
  reviewReducer,
} from './features/invoice-review/model';
import type { InvoiceField } from './features/invoice-review/model';
import './style.css';

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

function createSampleDocument(): DocumentAsset {
  return {
    id: 'sample-document',
    name: 'northstar-industrial-invoice.svg',
    kind: 'sample',
    url: '/demo-invoice.svg',
    file: null,
  };
}

function App() {
  const [documentAsset, setDocumentAsset] = useState<DocumentAsset>(createSampleDocument);
  const [review, dispatch] = useReducer(reviewReducer, undefined, createInitialReviewState);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDrawingEnabled, setIsDrawingEnabled] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const statusCounts = countStatuses(review.fields);
  const reviewComplete = review.fields.length > 0 && statusCounts.pending === 0;

  useEffect(() => () => {
    if (documentAsset.url.startsWith('blob:')) URL.revokeObjectURL(documentAsset.url);
  }, [documentAsset.url]);

  const reportError = useCallback((message: string) => {
    setUploadError(message);
  }, []);

  const handleUpload = useCallback((file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isPdf = file.type === 'application/pdf' || extension === 'pdf';
    const isSupportedImage = SUPPORTED_IMAGE_EXTENSIONS.has(extension) && (!file.type || file.type.startsWith('image/'));

    if (!isPdf && !isSupportedImage) {
      setUploadError('Choose a PDF, PNG, JPG, WEBP or GIF invoice.');
      return;
    }
    if (file.size === 0) {
      setUploadError('This file is empty. Choose another invoice.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError('The file is larger than 15 MB. Choose a smaller invoice.');
      return;
    }

    const nextDocument: DocumentAsset = {
      id: crypto.randomUUID(),
      name: file.name,
      kind: isPdf ? 'pdf' : 'image',
      url: URL.createObjectURL(file),
      file,
    };

    setDocumentAsset(nextDocument);
    dispatch({ type: 'reset', fields: createMockFields() });
    setDrafts({});
    setUploadError(null);
    setIsDrawingEnabled(false);
    setIsDropTarget(false);
  }, []);

  const handleFileInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) handleUpload(file);
    event.currentTarget.value = '';
  }, [handleUpload]);

  const handleDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDropTarget(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsDropTarget(false);
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDropTarget(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const selectField = useCallback((fieldId: string) => {
    dispatch({ type: 'select-field', fieldId });
    requestAnimationFrame(() => {
      document.getElementById(`field-card-${fieldId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  const updateDraft = useCallback((fieldId: string, value: string) => {
    setDrafts((current) => ({ ...current, [fieldId]: value }));
  }, []);

  const clearDraft = useCallback((fieldId: string) => {
    setDrafts((current) => {
      if (!(fieldId in current)) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }, []);

  const handleSaveEdit = useCallback((field: InvoiceField) => {
    const value = (drafts[field.id] ?? field.value).trim();
    if (!value) {
      setUploadError('Add a value before saving this field.');
      return;
    }
    if (value !== field.value) {
      dispatch({
        type: 'save-edit',
        fieldId: field.id,
        value,
        eventId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      });
    }
    clearDraft(field.id);
    setUploadError(null);
  }, [clearDraft, drafts]);

  const handleApprove = useCallback((field: InvoiceField) => {
    const value = (drafts[field.id] ?? field.value).trim();
    if (!value) {
      setUploadError('Add a value before approving this field.');
      return;
    }
    dispatch({
      type: 'approve-field',
      fieldId: field.id,
      value,
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });
    clearDraft(field.id);
    setUploadError(null);
  }, [clearDraft, drafts]);

  const handleReject = useCallback((field: InvoiceField) => {
    dispatch({
      type: 'reject-field',
      fieldId: field.id,
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });
    clearDraft(field.id);
    setUploadError(null);
  }, [clearDraft]);

  const handleCreateField = useCallback((bbox: readonly [number, number, number, number], page: number) => {
    const index = review.fields.filter((field) => field.source === 'manual').length + 1;
    const field: InvoiceField = {
      id: `manual-${crypto.randomUUID()}`,
      key: `manualField${index}`,
      label: `Manual field ${index}`,
      value: '',
      page,
      bbox,
      status: 'pending',
      source: 'manual',
    };

    dispatch({
      type: 'add-field',
      field,
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });
    setDrafts((current) => ({ ...current, [field.id]: '' }));
    setUploadError(null);
  }, [review.fields]);

  const resetReview = useCallback(() => {
    dispatch({ type: 'reset', fields: createMockFields() });
    setDrafts({});
    setUploadError(null);
    setIsDrawingEnabled(false);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand-lockup" href="#main" aria-label="Trace invoice review home">
          <span className="brand-mark"><span className="brand-mark-core" /></span>
          <span className="brand-copy">
            <span className="brand-name">trace<span>.</span></span>
            <span className="brand-caption">DOCUMENT REVIEW</span>
          </span>
        </a>
        <div className="topbar-meta">
          <span className="privacy-state"><i /> Local review session</span>
          <span className="topbar-divider" />
          <span className="topbar-avatar" aria-label="Reviewer">P</span>
        </div>
      </header>

      <main className="main-wrap" id="main">
        <section className="page-intro">
          <div className="page-intro-copy">
            <p className="eyebrow">WORKSPACE <span>/</span> INVOICE REVIEW</p>
            <h1>Make every value <em>traceable.</em></h1>
            <p className="page-intro-description">Review extracted data against its source, make corrections and keep a clear record of every decision.</p>
          </div>
          <div className="page-intro-actions">
            <span className="task-status"><i /> {reviewComplete ? 'Review complete' : 'Review in progress'}</span>
            <button type="button" className="button button--primary" onClick={() => fileInputRef.current?.click()}>
              <Icon name="upload" size={16} /> Upload invoice
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,.pdf,.png,.jpg,.jpeg,.webp,.gif"
              onChange={handleFileInput}
              className="visually-hidden"
              tabIndex={-1}
              aria-label="Choose invoice file"
            />
          </div>
        </section>

        <section className="overview-grid" aria-label="Review summary">
          <article className="overview-card overview-card--document">
            <div className="overview-icon"><Icon name="file-text" size={18} /></div>
            <div className="overview-content">
              <span className="overview-label">SOURCE DOCUMENT</span>
              <strong className="overview-value overview-value--document" title={documentAsset.name}>{documentAsset.name}</strong>
              <span className="overview-support">{documentAsset.kind === 'sample' ? 'Sample invoice · Ready to review' : `${documentAsset.kind.toUpperCase()} · Local file`}</span>
            </div>
          </article>
          <article className="overview-card">
            <div className="overview-icon overview-icon--amber"><Icon name="activity" size={18} /></div>
            <div className="overview-content">
              <span className="overview-label">NEEDS REVIEW</span>
              <strong className="overview-value">{String(statusCounts.pending).padStart(2, '0')}</strong>
              <span className="overview-support">of {review.fields.length} extracted fields</span>
            </div>
          </article>
          <article className="overview-card">
            <div className="overview-icon overview-icon--green"><Icon name="check-circle" size={18} /></div>
            <div className="overview-content">
              <span className="overview-label">APPROVED</span>
              <strong className="overview-value">{String(statusCounts.approved).padStart(2, '0')}</strong>
              <span className="overview-support">{review.fields.length > 0 ? Math.round((statusCounts.approved / review.fields.length) * 100) : 0}% of fields verified</span>
            </div>
          </article>
          <article className="overview-card">
            <div className="overview-icon overview-icon--violet"><Icon name="history" size={18} /></div>
            <div className="overview-content">
              <span className="overview-label">AUDIT EVENTS</span>
              <strong className="overview-value">{String(review.events.length).padStart(2, '0')}</strong>
              <span className="overview-support">Changes recorded this session</span>
            </div>
          </article>
        </section>

        {uploadError && (
          <div className="alert-banner" role="alert">
            <Icon name="alert-circle" size={17} />
            <span>{uploadError}</span>
            <button type="button" onClick={() => setUploadError(null)} aria-label="Dismiss message"><Icon name="x" size={16} /></button>
          </div>
        )}

        <div className="workspace-grid">
          <DocumentViewer
            key={documentAsset.id}
            document={documentAsset}
            fields={review.fields}
            selectedFieldId={review.selectedFieldId}
            isDrawingEnabled={isDrawingEnabled}
            isDropTarget={isDropTarget}
            onSelectField={selectField}
            onCreateField={handleCreateField}
            onToggleDrawing={() => setIsDrawingEnabled((enabled) => !enabled)}
            onUploadClick={() => fileInputRef.current?.click()}
            onError={reportError}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
          <FieldReviewPanel
            fields={review.fields}
            selectedFieldId={review.selectedFieldId}
            drafts={drafts}
            onSelectField={selectField}
            onDraftChange={updateDraft}
            onSaveEdit={handleSaveEdit}
            onApprove={handleApprove}
            onReject={handleReject}
            onReset={resetReview}
          />
        </div>

        <ActivityLog events={review.events} />

        <footer className="app-footer">
          <div className="footer-brand"><span className="footer-brand-dot" /> TRACE <span className="footer-divider">/</span> INVOICE REVIEW</div>
          <div className="footer-right"><Icon name="shield-check" size={13} /> Local prototype · Mock data only</div>
        </footer>
      </main>
    </div>
  );
}

export default App;
