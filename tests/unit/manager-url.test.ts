import { describe, it, expect } from 'vitest';
import { normalizeGitUrl } from '../../src/repo/manager.js';

describe('normalizeGitUrl', () => {
  it('treats the .git suffix and a trailing slash as insignificant', () => {
    const canonical = normalizeGitUrl('https://github.com/microsoft/BCQuality');
    expect(normalizeGitUrl('https://github.com/microsoft/BCQuality.git')).toBe(canonical);
    expect(normalizeGitUrl('https://github.com/microsoft/BCQuality/')).toBe(canonical);
    expect(normalizeGitUrl('https://github.com/microsoft/BCQuality.git/')).toBe(canonical);
  });

  it('normalizes the scp form to match the https form', () => {
    expect(normalizeGitUrl('git@github.com:microsoft/BCQuality.git')).toBe(
      normalizeGitUrl('https://github.com/microsoft/BCQuality.git'),
    );
    expect(normalizeGitUrl('ssh://git@github.com/microsoft/BCQuality.git')).toBe(
      normalizeGitUrl('https://github.com/microsoft/BCQuality.git'),
    );
  });

  it('ignores casing and a git+ prefix', () => {
    expect(normalizeGitUrl('https://GitHub.com/Microsoft/BCQuality.git')).toBe(
      normalizeGitUrl('https://github.com/microsoft/bcquality'),
    );
    expect(normalizeGitUrl('git+https://github.com/microsoft/BCQuality.git')).toBe(
      normalizeGitUrl('https://github.com/microsoft/BCQuality.git'),
    );
  });

  it('strips embedded credentials so a token does not read as a different repo', () => {
    expect(normalizeGitUrl('https://user:token@github.com/microsoft/BCQuality.git')).toBe(
      normalizeGitUrl('https://github.com/microsoft/BCQuality.git'),
    );
  });

  it('still distinguishes a fork from its upstream', () => {
    expect(normalizeGitUrl('https://github.com/DynamicsInternational/BCQuality.git')).not.toBe(
      normalizeGitUrl('https://github.com/microsoft/BCQuality.git'),
    );
  });

  it('distinguishes different hosts for the same path', () => {
    expect(normalizeGitUrl('https://gitlab.com/microsoft/BCQuality.git')).not.toBe(
      normalizeGitUrl('https://github.com/microsoft/BCQuality.git'),
    );
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeGitUrl('')).toBe('');
    expect(normalizeGitUrl('   ')).toBe('');
  });
});
