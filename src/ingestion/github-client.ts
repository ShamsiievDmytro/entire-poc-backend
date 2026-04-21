import { Octokit } from 'octokit';
import { config } from '../config.js';

let instance: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!instance) {
    instance = new Octokit({ auth: config.GITHUB_TOKEN });
  }
  return instance;
}
