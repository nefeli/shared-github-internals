// @flow strict

import type { Github } from "@octokit/rest";
import generateUuid from "uuid/v4";

type PullRequestNumber = number;

/**
 * A Git reference name.
 */
type Reference = string;

type RepoName = string;

type RepoOwner = string;

/**
 * A Git SHA-1.
 */
type Sha = string;

const generateUniqueRef = (ref: Reference): Reference =>
  `${ref}-${generateUuid()}`;
const getHeadRef = (ref: Reference): Reference => `heads/${ref}`;
const getFullyQualifiedRef = (ref: Reference): Reference =>
  `refs/${getHeadRef(ref)}`;

const fetchReferenceSha = async ({
  octokit,
  owner,
  ref,
  repo,
}: {
  octokit: Github,
  owner: RepoOwner,
  ref: Reference,
  repo: RepoName,
}): Promise<Sha> => {
  const {
    data: {
      object: { sha },
    },
  } = await octokit.gitdata.getReference({
    owner,
    ref: getHeadRef(ref),
    repo,
  });
  return sha;
};

const updateReference = async ({
  force,
  octokit,
  owner,
  ref,
  repo,
  sha,
}: {
  force: boolean,
  octokit: Github,
  owner: RepoOwner,
  ref: Reference,
  repo: RepoName,
  sha: Sha,
}): Promise<void> => {
  await octokit.gitdata.updateReference({
    force,
    owner,
    ref: getHeadRef(ref),
    repo,
    sha,
  });
};

const deleteReference = async ({
  octokit,
  owner,
  ref,
  repo,
}: {
  octokit: Github,
  owner: RepoOwner,
  ref: Reference,
  repo: RepoName,
}): Promise<void> => {
  await octokit.gitdata.deleteReference({
    owner,
    ref: getHeadRef(ref),
    repo,
  });
};

const createReference = async ({
  octokit,
  owner,
  ref,
  repo,
  sha,
}: {
  octokit: Github,
  owner: RepoOwner,
  ref: Reference,
  repo: RepoName,
  sha: Sha,
}): Promise<void> => {
  await octokit.gitdata.createReference({
    owner,
    ref: getFullyQualifiedRef(ref),
    repo,
    sha,
  });
};

const createTemporaryReference = async ({
  octokit,
  owner,
  ref,
  repo,
  sha,
}: {
  octokit: Github,
  owner: RepoOwner,
  ref: Reference,
  repo: RepoName,
  sha: Sha,
}): Promise<{
  deleteTemporaryReference: () => Promise<void>,
  temporaryRef: Reference,
}> => {
  const temporaryRef = generateUniqueRef(ref);
  await createReference({
    octokit,
    owner,
    ref: temporaryRef,
    repo,
    sha,
  });
  return {
    async deleteTemporaryReference() {
      await deleteReference({
        octokit,
        owner,
        ref: temporaryRef,
        repo,
      });
    },
    temporaryRef,
  };
};

const withTemporaryReference: <T>({
  action(Reference): Promise<T>,
  octokit: Github,
  owner: RepoOwner,
  ref: Reference,
  repo: RepoName,
  sha: Sha,
}) => Promise<T> = async ({ action, octokit, owner, ref, repo, sha }) => {
  const {
    deleteTemporaryReference,
    temporaryRef,
  } = await createTemporaryReference({
    octokit,
    owner,
    ref,
    repo,
    sha,
  });

  try {
    return await action(temporaryRef);
  } finally {
    await deleteTemporaryReference();
  }
};

const getCommitShas = response => response.data.map(({ sha }) => sha);

const fetchCommits = async ({
  number,
  octokit,
  owner,
  repo,
}: {
  number: PullRequestNumber,
  octokit: Github,
  owner: RepoOwner,
  repo: RepoName,
}): Promise<Array<Sha>> => {
  let response = await octokit.pullRequests.getCommits({ number, owner, repo });
  const commits = getCommitShas(response);
  while (octokit.hasNextPage(response)) {
    // Pagination is a legit use-case for using await in loops.
    // See https://github.com/octokit/rest.js#pagination
    // eslint-disable-next-line no-await-in-loop
    response = await octokit.getNextPage(response);
    commits.push(...getCommitShas(response));
  }
  return commits;
};

export type { PullRequestNumber, Reference, RepoName, RepoOwner, Sha };

export {
  createReference,
  createTemporaryReference,
  deleteReference,
  fetchCommits,
  fetchReferenceSha,
  generateUniqueRef,
  getHeadRef,
  updateReference,
  withTemporaryReference,
};
