import { RootBucket, saveRootBucket } from '../storage/root';
import { ensureRepo } from '../storage/hf';
import { HfProfile } from './oauth';
import { createBucket } from '../storage/buckets';
import { forgetVault } from '../storage/vault';

/**
 * Turns a finished Hugging Face authorisation into somewhere to keep papers.
 *
 * The Hub's OAuth tokens expire — eight hours at the time of writing — so the
 * console shows when a connection needs renewing and offers the one-click
 * reconnect. A pasted write token, which does not expire, stays the right
 * choice for a server nobody watches.
 */

export interface ConnectInput {
  profile: HfProfile;
  accessToken: string;
  expiresAt: string | null;
  /** `root` is the store the settings themselves live in. */
  owner: 'root' | 'platform' | { orgId: string };
  visibility: 'public' | 'private';
  /** `namespace/name`, or just a name to put under the account's namespace. */
  repo: string;
}

export interface ConnectResult { repoId: string; created: 'root' | 'target' }

function repoIdFor(input: ConnectInput): string {
  const wanted = input.repo.trim();
  if (wanted.includes('/')) return wanted;
  const name = wanted || (input.visibility === 'public' ? 'testora-public' : 'testora-private');
  return `${input.profile.username}/${name}`;
}

export async function connectHfStorage(input: ConnectInput): Promise<ConnectResult> {
  const repoId = repoIdFor(input);
  const target = {
    token: input.accessToken,
    repoId,
    private: input.visibility !== 'public',
    revision: 'main',
  };
  // Create it now, while the authorisation is fresh, so a failure is visible
  // here rather than at the first upload.
  await ensureRepo(target);

  if (input.owner === 'root') {
    const value: RootBucket = {
      kind: 'hf',
      provider: 'r2',
      accountId: '', bucket: '', region: 'auto', endpoint: '',
      accessKeyId: '', secretAccessKey: '', publicBaseUrl: '',
      label: `Hugging Face — ${repoId}`,
      hfToken: input.accessToken,
      hfRepoId: repoId,
      hfRevision: 'main',
    };
    const saved = saveRootBucket(value);
    forgetVault();
    if (!saved.ok) throw new Error(saved.error ?? 'Could not write the local configuration.');
    return { repoId, created: 'root' };
  }

  await createBucket({
    orgId: input.owner === 'platform' ? null : input.owner.orgId,
    label: `Hugging Face — ${repoId}`,
    kind: 'hf',
    visibility: input.visibility,
    hfRepoId: repoId,
    hfRevision: 'main',
    hfToken: input.accessToken,
    provider: 'r2',
    accountId: '', bucket: '', region: 'auto', endpoint: '', accessKeyId: '', publicBaseUrl: '',
    enabled: true,
  });
  return { repoId, created: 'target' };
}
