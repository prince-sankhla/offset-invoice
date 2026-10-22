import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { InvoiceField, ReviewStatus } from './model';

interface FieldReviewPanelProps {
  fields: InvoiceField[];
  selectedFieldId: string | null;
  drafts: Record<string, string>;
  onSelectField: (fieldId: string) => void;
  onDraftChange: (fieldId: string, value: string) => void;
  onSaveEdit: (field: InvoiceField) => void;
  onApprove: (field: InvoiceField) => void;
  onReject: (field: InvoiceField) => void;
  onReset: () => void;
}

type FilterValue = 'all' | ReviewStatus;

const filters: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All fields' },
  { value: 'pending', label: 'Needs review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export function FieldReviewPanel({
  fields,
  selectedFieldId,
  drafts,
  onSelectField,
  onDraftChange,
  onSaveEdit,
  onApprove,
  onReject,
  onReset,
}: FieldReviewPanelProps) {
  const [filter, setFilter] = useState<FilterValue>('all');
  const filteredFields = useMemo(
    () => filter === 'all' ? fields : fields.filter((field) => field.status === filter),
    [fields, filter],
  );
  const pendingCount = fields.filter((field) => field.status === 'pending').length;
  const approvedCount = fields.filter((field) => field.status === 'approved').length;
  const rejectedCount = fields.filter((field) => field.status === 'rejected').length;

  useEffect(() => {
    const selected = fields.find((field) => field.id === selectedFieldId);
    if (selected && filter !== 'all' && selected.status !== filter) setFilter('all');
  }, [fields, filter, selectedFieldId]);

  return (
    <section className="panel review-panel" aria-label="Extracted invoice fields">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">02 / REVIEW</p>
          <h2>Extracted fields <span className="heading-count">{fields.length}</span></h2>
          <p className="panel-description">Check each value against the source before approving.</p>
        </div>
        <span className="data-source-tag"><span className="data-source-dot" /> Mock JSON</span>
      </div>

      <div className="field-progress" aria-label={`${approvedCount} of ${fields.length} fields approved`}>
        <div className="field-progress-copy">
          <span>Review progress</span>
          <strong>{fields.length === 0 ? 0 : Math.round((approvedCount / fields.length) * 100)}%</strong>
        </div>
        <div className="progress-track"><span style={{ width: `${fields.length === 0 ? 0 : (approvedCount / fields.length) * 100}%` }} /></div>
        <div className="field-status-summary">
          <span><i className="status-marker status-marker--pending" /> {pendingCount} pending</span>
          <span><i className="status-marker status-marker--approved" /> {approvedCount} approved</span>
          <span><i className="status-marker status-marker--rejected" /> {rejectedCount} rejected</span>
        </div>
      </div>

      <div className="field-filter-row" role="group" aria-label="Filter invoice fields">
        {filters.map((item) => (
          <button
            type="button"
            key={item.value}
            className={`filter-chip${filter === item.value ? ' is-active' : ''}`}
            onClick={() => setFilter(item.value)}
            aria-pressed={filter === item.value}
          >
            {item.label}
            {item.value === 'pending' && <span>{pendingCount}</span>}
          </button>
        ))}
      </div>

      <div className="field-list" aria-live="polite">
        {filteredFields.map((field) => {
          const draftValue = drafts[field.id] ?? field.value;
          const isDirty = draftValue !== field.value;
          const isEmpty = draftValue.trim().length === 0;
          const isSelected = field.id === selectedFieldId;
          const coordinates = field.bbox;

          return (
            <article
              id={`field-card-${field.id}`}
              key={field.id}
              className={`field-card${isSelected ? ' field-card--selected' : ''}`}
            >
              <div className="field-card-heading">
                <button
                  type="button"
                  className="field-name-button"
                  onClick={() => onSelectField(field.id)}
                  aria-pressed={isSelected}
                >
                  <span className="field-source-indicator" aria-hidden="true" />
                  <span className="field-label">{field.label}</span>
                  <span className={`status-pill status-pill--${field.status}`}>{statusText(field.status)}</span>
                </button>
                <span className="field-kind">{field.source === 'manual' ? 'MANUAL' : field.key.toUpperCase()}</span>
              </div>

              <label className="field-input-label" htmlFor={`field-value-${field.id}`}>Value</label>
              <div className="field-input-row">
                <input
                  id={`field-value-${field.id}`}
                  className="field-value-input"
                  type="text"
                  value={draftValue}
                  onFocus={() => onSelectField(field.id)}
                  onChange={(event) => onDraftChange(field.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && isDirty && !isEmpty) {
                      event.preventDefault();
                      onSaveEdit(field);
                    }
                  }}
                  placeholder={field.source === 'manual' ? 'Enter the value from the source' : 'Extracted value'}
                  aria-describedby={`field-meta-${field.id}`}
                />
                <button
                  type="button"
                  className="icon-button locate-button"
                  onClick={() => onSelectField(field.id)}
                  aria-label={`Locate ${field.label} in the document`}
                  title="Locate in source"
                >
                  <Icon name="arrow-up-right" size={15} />
                </button>
              </div>

              <div className="field-meta" id={`field-meta-${field.id}`}>
                <span>Page {field.page}</span>
                <span>Source box · {Math.round(coordinates[0] * 100)}%, {Math.round(coordinates[1] * 100)}%</span>
              </div>

              <div className="field-actions">
                <button type="button" className="button button--quiet" onClick={() => onSaveEdit(field)} disabled={!isDirty || isEmpty}>
                  Save edit
                </button>
                <span className="field-action-spacer" />
                <button type="button" className="button button--reject" onClick={() => onReject(field)}>
                  Reject
                </button>
                <button type="button" className="button button--approve" onClick={() => onApprove(field)} disabled={isEmpty}>
                  <Icon name="check" size={14} /> Approve
                </button>
              </div>
            </article>
          );
        })}
        {filteredFields.length === 0 && (
          <div className="field-empty-state">
            <span className="empty-state-icon"><Icon name="check-circle" size={20} /></span>
            <strong>{filter === 'all' ? 'No extracted fields yet' : `No ${filter === 'pending' ? 'fields need review' : `${filter} fields`}`}</strong>
            <p>{filter === 'all' ? 'Draw a box on the document to add a field.' : 'Try another filter to see more fields.'}</p>
          </div>
        )}
      </div>

      <div className="panel-bottom-bar">
        <div className="privacy-caption"><Icon name="shield-check" size={14} /><span>Browser-only demo · No data is sent</span></div>
        <button type="button" className="text-action" onClick={onReset}><Icon name="refresh" size={13} /> Reset review</button>
      </div>
    </section>
  );
}

function statusText(status: ReviewStatus): string {
  switch (status) {
    case 'pending': return 'Needs review';
    case 'approved': return 'Approved';
    case 'rejected': return 'Rejected';
  }
}
