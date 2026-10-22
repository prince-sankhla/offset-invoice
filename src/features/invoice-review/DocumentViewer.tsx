import { useEffect, useRef, useState } from 'react';
import type { DragEvent, PointerEvent } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Icon } from '../../components/Icon';
import { boxToPercentStyle } from './model';
import type { BoundingBox, InvoiceField } from './model';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface DocumentAsset {
  id: string;
  name: string;
  kind: 'sample' | 'image' | 'pdf';
  url: string;
  file: File | null;
}

interface DocumentViewerProps {
  document: DocumentAsset;
  fields: InvoiceField[];
  selectedFieldId: string | null;
  isDrawingEnabled: boolean;
  isDropTarget: boolean;
  onSelectField: (fieldId: string) => void;
  onCreateField: (bbox: BoundingBox, page: number) => void;
  onToggleDrawing: () => void;
  onUploadClick: () => void;
  onError: (message: string) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

export function DocumentViewer({
  document,
  fields,
  selectedFieldId,
  isDrawingEnabled,
  isDropTarget,
  onSelectField,
  onCreateField,
  onToggleDrawing,
  onUploadClick,
  onError,
  onDragOver,
  onDragLeave,
  onDrop,
}: DocumentViewerProps) {
  const isPdf = document.kind === 'pdf';
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [previewBox, setPreviewBox] = useState<BoundingBox | null>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageNumber(1);
    setPageCount(1);
    setPdfDocument(null);

    if (document.kind !== 'pdf' || !document.file) {
      setIsLoadingPdf(false);
      return;
    }

    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    setIsLoadingPdf(true);

    async function loadPdf() {
      try {
        const bytes = await document.file!.arrayBuffer();
        if (cancelled) return;

        loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
        const loadedDocument = await loadingTask.promise;
        if (cancelled) {
          await loadedDocument.destroy();
          return;
        }

        setPdfDocument(loadedDocument);
        setPageCount(loadedDocument.numPages);
      } catch {
        if (!cancelled) onError('This PDF could not be opened. Try exporting it again or upload an image instead.');
      } finally {
        if (!cancelled) setIsLoadingPdf(false);
      }
    }

    void loadPdf();
    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [document.id, document.kind, document.file, onError]);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    setIsRenderingPage(true);

    async function renderPage() {
      try {
        const page = await pdfDocument!.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const renderScale = Math.min(1.65, Math.max(1.15, 900 / baseViewport.width));
        const viewport = page.getViewport({ scale: renderScale * outputScale });
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d', { alpha: false });
        if (!canvas || !context) throw new Error('Your browser could not prepare the PDF preview.');

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!cancelled && !message.toLowerCase().includes('cancel')) {
          onError(message || 'This page could not be rendered. Try another PDF.');
        }
      } finally {
        if (!cancelled) setIsRenderingPage(false);
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDocument, pageNumber, onError]);

  useEffect(() => {
    if (!isDrawingEnabled) {
      setDrawStart(null);
      setPreviewBox(null);
    }
  }, [isDrawingEnabled]);

  const visibleFields = fields.filter((field) => field.page === pageNumber);
  const displayedType = isPdf ? 'PDF' : document.name.split('.').pop()?.toUpperCase() || 'IMAGE';

  function pointerPosition(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!isDrawingEnabled || event.button !== 0) return;
    const point = pointerPosition(event);
    setDrawStart(point);
    setPreviewBox([point.x, point.y, point.x, point.y]);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isDrawingEnabled || !drawStart) return;
    const point = pointerPosition(event);
    setPreviewBox([
      Math.min(drawStart.x, point.x),
      Math.min(drawStart.y, point.y),
      Math.max(drawStart.x, point.x),
      Math.max(drawStart.y, point.y),
    ]);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!isDrawingEnabled || !drawStart) return;
    const point = pointerPosition(event);
    const box: BoundingBox = [
      Math.min(drawStart.x, point.x),
      Math.min(drawStart.y, point.y),
      Math.max(drawStart.x, point.x),
      Math.max(drawStart.y, point.y),
    ];
    const bounds = stageRef.current?.getBoundingClientRect();
    const hasUsefulArea = bounds
      && (box[2] - box[0]) * bounds.width >= 12
      && (box[3] - box[1]) * bounds.height >= 8;

    if (hasUsefulArea) onCreateField(box, pageNumber);
    setDrawStart(null);
    setPreviewBox(null);
    if (hasUsefulArea) onToggleDrawing();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    setDrawStart(null);
    setPreviewBox(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }


  return (
    <section
      className={`panel source-panel${isDropTarget ? ' source-panel--drop-target' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label="Invoice source document"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">01 / SOURCE</p>
          <h2>Document</h2>
          <p className="panel-description">Select a field to trace it back to the source.</p>
        </div>
        <span className="file-type-tag">{displayedType}</span>
      </div>

      <div className="document-toolbar">
        <div className="document-identity">
          <span className="document-icon"><Icon name={isPdf ? 'file-text' : 'image'} size={17} /></span>
          <div className="document-name-group">
            <span className="document-name" title={document.name}>{document.name}</span>
            <span className="document-state"><span className="state-indicator" /> {document.kind === 'sample' ? 'Sample invoice' : 'Local file · browser only'}</span>
          </div>
        </div>
        <div className="toolbar-actions">
          {isPdf && (
            <div className="pagination-control" aria-label="PDF page navigation">
              <button type="button" className="icon-button" onClick={() => setPageNumber((page) => Math.max(1, page - 1))} disabled={pageNumber <= 1} aria-label="Previous page">
                <Icon name="chevron-left" />
              </button>
              <span className="page-count">{pageNumber} <span>/</span> {pageCount}</span>
              <button type="button" className="icon-button" onClick={() => setPageNumber((page) => Math.min(pageCount, page + 1))} disabled={pageNumber >= pageCount} aria-label="Next page">
                <Icon name="chevron-right" />
              </button>
            </div>
          )}
          <button
            type="button"
            className={`icon-button draw-toggle${isDrawingEnabled ? ' is-active' : ''}`}
            onClick={onToggleDrawing}
            aria-pressed={isDrawingEnabled}
            aria-label={isDrawingEnabled ? 'Cancel manual field drawing' : 'Draw a field on the document'}
            title={isDrawingEnabled ? 'Cancel drawing' : 'Add a field manually'}
          >
            <Icon name="plus" />
          </button>
        </div>
      </div>

      {isDrawingEnabled && (
        <div className="drawing-instruction" role="status">
          <span className="drawing-instruction-mark"><Icon name="plus" size={13} /></span>
          Drag over a value on the document. A new field will be added to the review panel.
          <button type="button" onClick={onToggleDrawing}>Cancel</button>
        </div>
      )}

      <div className="document-viewport-wrap">
        <div
          ref={stageRef}
          className={`document-stage${isDrawingEnabled ? ' document-stage--drawing' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={() => { setDrawStart(null); setPreviewBox(null); }}
        >
          {isPdf ? (
            <canvas ref={canvasRef} className="document-canvas" aria-label={`PDF page ${pageNumber}`} />
          ) : (
            <img
              className="document-image"
              src={document.url}
              alt="Invoice source document"
              draggable={false}
              onError={() => onError('The invoice preview could not be loaded. Try uploading the file again.')}
            />
          )}

          <div className="overlay-layer" aria-label="Field source highlights">
            {visibleFields.map((field) => (
              <button
                key={field.id}
                type="button"
                className={`source-highlight source-highlight--${field.status}${field.id === selectedFieldId ? ' is-selected' : ''}`}
                style={boxToPercentStyle(field.bbox)}
                onClick={(event) => {
                  if (isDrawingEnabled) return;
                  event.stopPropagation();
                  onSelectField(field.id);
                }}
                title={`${field.label}: ${field.value || 'No value entered'}`}
                aria-label={`Select source for ${field.label}`}
                aria-pressed={field.id === selectedFieldId}
              />
            ))}
            {previewBox && <div className="source-highlight source-highlight--preview" style={boxToPercentStyle(previewBox)} />}
          </div>

          {(isLoadingPdf || isRenderingPage) && isPdf && (
            <div className="document-loading" role="status">
              <span className="spinner" />
              <span>{isLoadingPdf ? 'Opening document…' : 'Rendering page…'}</span>
            </div>
          )}

          {isDropTarget && (
            <div className="drop-overlay">
              <span className="drop-overlay-icon"><Icon name="upload" size={22} /></span>
              <strong>Drop invoice to review</strong>
              <span>PDF, PNG, JPG or WEBP · Up to 15 MB</span>
            </div>
          )}
        </div>
      </div>

      <div className="document-footer">
        <div className="legend-item"><span className="legend-swatch legend-swatch--selected" /> Selected source</div>
        <div className="legend-item"><span className="legend-swatch legend-swatch--approved" /> Approved</div>
        <div className="legend-item"><span className="legend-swatch legend-swatch--pending" /> Needs review</div>
        <button type="button" className="text-action" onClick={onUploadClick}><Icon name="upload" size={13} /> Replace file</button>
      </div>

      {document.kind !== 'sample' && (
        <div className="document-note">
          <Icon name="shield-check" size={14} />
          <span>File processing stays in this browser. Demo values are not OCR results.</span>
        </div>
      )}
      {isPdf && pageCount > 1 && <div className="page-footnote">Showing page {pageNumber} of {pageCount}. Field boxes are stored as page-relative coordinates.</div>}
    </section>
  );
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
