import { Octokit } from '@octokit/rest';
import { config } from '../config.js';
import { log } from '../utils/logger.js';

let instance: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!instance) {
    log('info', 'Creating Octokit instance', { tokenPrefix: config.GITHUB_TOKEN.slice(0, 15) });
    instance = new Octokit({ auth: config.GITHUB_TOKEN });
  }
  return instance;
}
