import { downloadDataset, dataset } from '../data/repository';
import { Icon } from './Icon';

export const DownloadDataButton = ({ compact }: { compact?: boolean }) => (
  <button type="button" className={`btn${compact ? ' btn-sm' : ''}`} onClick={downloadDataset} aria-label="Download demo data (JSON)" title="Download demo data (JSON)">
    <Icon name="download" size={14} /><span className="dl-label">Download demo data (JSON)</span>
  </button>
);

export const SyntheticFootnote = () => (
  <p className="muted" style={{ fontSize: 12 }}>
    {dataset.meta.disclaimer} Dataset anchored at {dataset.meta.anchorTime}.
  </p>
);
