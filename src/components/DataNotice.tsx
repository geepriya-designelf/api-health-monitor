import { downloadDataset, dataset } from '../data/repository';
import { Icon } from './Icon';

export const DownloadDataButton = ({ compact }: { compact?: boolean }) => (
  <button type="button" className={`btn${compact ? ' btn-sm' : ''}`} onClick={downloadDataset} aria-label="Download mock data (JSON)" title="Download mock data (JSON)">
    <Icon name="download" size={14} /><span className="dl-label">Download mock data (JSON)</span>
  </button>
);

export const SyntheticFootnote = () => (
  <p className="muted" style={{ fontSize: 12 }}>
    {dataset.meta.disclaimer} Dataset anchored at {dataset.meta.anchorTime}.
  </p>
);
