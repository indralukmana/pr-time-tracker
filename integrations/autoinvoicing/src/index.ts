import { RequestError } from '@octokit/request-error';
import { RequestRequestOptions } from '@octokit/types';
import {
  CreateEvent,
  IssueCommentEvent,
  IssuesAssignedEvent,
  IssuesEvent,
  CheckRunEvent,
  IssuesOpenedEvent,
  PullRequestEvent,
  PullRequestReviewEvent,
  PushEvent,
  RepositoryCreatedEvent,
  StarCreatedEvent,
  StarEvent,
  CheckSuiteEvent,
  IssuesLabeledEvent,
  IssuesUnlabeledEvent
} from '@octokit/webhooks-types';
import { truncate } from '@trigger.dev/integration-kit';
import {
  ConnectionAuth,
  EventSpecification,
  ExternalSourceTrigger,
  IO,
  IOTask,
  IntegrationTaskKey,
  Json,
  RunTaskErrorCallback,
  RunTaskOptions,
  TriggerIntegration,
  retry
} from '@trigger.dev/sdk';
import { Octokit } from 'octokit';

import { createOrgEventSource, createRepoEventSource } from './sources';
import {
  checkRunCreated,
  checkSuiteCompleted,
  issueAssigned,
  issueCommentCreated,
  issueLabeled,
  issueOpened,
  issueUnlabeled,
  newBranch,
  pullRequestOpened,
  pullRequestReviewSubmitted,
  push,
  starredRepo
} from './webhook-examples';
import { Issues } from './issues';
import { Repos } from './repos';
import { Checks } from './checks';
import { Reactions } from './reactions';
import { Compound } from './compound';
import { Orgs } from './orgs';
import { Git } from './git';

export type GithubIntegrationOptions = {
  id: string;
  token?: string;
  octokitRequest?: RequestRequestOptions;
};

type GithubSources = {
  repo: ReturnType<typeof createRepoEventSource>;
  org: ReturnType<typeof createOrgEventSource>;
};

type GithubTriggers = {
  repo: ReturnType<typeof createRepoTrigger>;
  org: ReturnType<typeof createOrgTrigger>;
};

export type GitHubRunTask = InstanceType<typeof Autoinvoicing>['runTask'];
export type GitHubReturnType<T extends (params: any) => Promise<{ data: K }>, K = any> = Promise<
  Awaited<ReturnType<T>>['data']
>;

export class Autoinvoicing implements TriggerIntegration {
  // @internal
  private _options: GithubIntegrationOptions;
  // @internal
  private _client?: Octokit;
  // @internal
  private _io?: IO;
  // @internal
  private _connectionKey?: string;

  _repoSource: ReturnType<typeof createRepoEventSource>;
  _orgSource: ReturnType<typeof createOrgEventSource>;
  _repoTrigger: ReturnType<typeof createRepoTrigger>;
  _orgTrigger: ReturnType<typeof createOrgTrigger>;

  constructor(private options: GithubIntegrationOptions) {
    if (Object.keys(options).includes('token') && !options.token) {
      throw `Can't create GitHub integration (${options.id}) as token was undefined`;
    }

    this._options = options;

    this._repoSource = createRepoEventSource(this);
    this._orgSource = createOrgEventSource(this);
    this._repoTrigger = createRepoTrigger(this._repoSource);
    this._orgTrigger = createOrgTrigger(this._orgSource);
  }

  get id() {
    return this.options.id;
  }

  get metadata() {
    return { name: 'GitHub', id: 'github' };
  }

  get authSource() {
    return this._options.token ? ('LOCAL' as const) : ('HOSTED' as const);
  }

  cloneForRun(io: IO, connectionKey: string, auth?: ConnectionAuth) {
    const autoinvoicing = new Autoinvoicing(this._options);
    autoinvoicing._io = io;
    autoinvoicing._connectionKey = connectionKey;
    autoinvoicing._client = createClientFromOptions(this._options, auth);
    return autoinvoicing;
  }

  get sources(): GithubSources {
    return {
      repo: this._repoSource,
      org: this._orgSource
    };
  }

  get triggers(): GithubTriggers {
    return {
      repo: this._repoTrigger,
      org: this._orgTrigger
    };
  }

  runTask<T, TResult extends Json<T> | void>(
    key: IntegrationTaskKey,
    callback: (client: Octokit, task: IOTask, io: IO) => Promise<TResult>,
    options?: RunTaskOptions,
    errorCallback?: RunTaskErrorCallback
  ): Promise<TResult> {
    if (!this._io) throw new Error('No IO');
    if (!this._connectionKey) throw new Error('No connection key');

    return this._io.runTask(
      key,
      (task, io) => {
        if (!this._client) throw new Error('No client');
        return callback(this._client, task, io);
      },
      {
        icon: 'github',
        retry: retry.standardBackoff,
        ...(options ?? {}),
        connectionKey: this._connectionKey
      },
      errorCallback
    );
  }

  get issues() {
    return new Issues(this.runTask.bind(this));
  }

  get repos() {
    return new Repos(this.runTask.bind(this));
  }

  get reactions() {
    return new Reactions(this.runTask.bind(this));
  }

  get compound() {
    return new Compound(this.runTask.bind(this), this.issues, this.reactions);
  }

  get orgs() {
    return new Orgs(this.runTask.bind(this));
  }

  get git() {
    return new Git(this.runTask.bind(this));
  }

  get checks() {
    return new Checks(this.runTask.bind(this));
  }

  createIssue = this.issues.create;
  addIssueAssignees = this.issues.addAssignees;
  addIssueLabels = this.issues.addLabels;
  createIssueComment = this.issues.createComment;
  getIssue = this.issues.get;
  getRepo = this.repos.get;
  updateWebhook = this.repos.updateWebhook;
  createWebhook = this.repos.createWebhook;
  listWebhooks = this.repos.listWebhooks;
  addIssueCommentReaction = this.reactions.createForIssueComment;
  createIssueCommentWithReaction = this.compound.createIssueCommentWithReaction;
  updateOrgWebhook = this.orgs.updateWebhook;
  createOrgWebhook = this.orgs.createWebhook;
  listOrgWebhooks = this.orgs.listWebhooks;
  createBlob = this.git.createBlob;
  getBlob = this.git.getBlob;
  createCommit = this.git.createCommit;
  getCommit = this.git.getCommit;
  listMatchingReferences = this.git.listMatchingRefs;
  getReference = this.git.getRef;
  createReference = this.git.createRef;
  updateReference = this.git.updateRef;
  deleteReference = this.git.deleteRef;
  createTag = this.git.createTag;
  getTag = this.git.getTag;
  createTree = this.git.createTree;
  getTree = this.git.getTree;
  createCheck = this.checks.create;
  createCheckSuite = this.checks.createSuite;
  getCheck = this.checks.get;
  getCheckSuite = this.checks.getSuite;
  reRunCheck = this.checks.reRun;
}

function createClientFromOptions(
  options: GithubIntegrationOptions,
  auth?: ConnectionAuth
): Octokit {
  if (Object.keys(options).includes('token') && !options.token) {
    throw `Can't create GitHub integration (${options.id}) as token was undefined`;
  }

  if (options.token) {
    return new Octokit({
      auth: options.token,
      request: options.octokitRequest,
      retry: {
        enabled: false
      }
    });
  }

  if (!auth) {
    throw new Error('No auth');
  }

  return new Octokit({
    auth: auth.accessToken,
    request: options.octokitRequest,
    retry: {
      enabled: false
    }
  });
}

const onIssue: EventSpecification<IssuesEvent> = {
  name: 'issues',
  title: 'On issue',
  source: 'github.com',
  icon: 'github',
  examples: [issueOpened, issueAssigned, issueLabeled, issueCommentCreated],
  parsePayload: (payload) => payload as IssuesEvent,
  runProperties: (payload) => issueProperties(payload)
};

const onIssueOpened: EventSpecification<IssuesOpenedEvent> = {
  name: 'issues',
  title: 'On issue opened',
  source: 'github.com',
  icon: 'github',
  filter: {
    action: ['opened']
  },
  examples: [issueOpened],
  parsePayload: (payload) => payload as IssuesOpenedEvent,
  runProperties: (payload) => issueProperties(payload)
};

const onIssueAssigned: EventSpecification<IssuesAssignedEvent> = {
  name: 'issues',
  title: 'On issue assigned',
  source: 'github.com',
  icon: 'github',
  filter: {
    action: ['assigned']
  },
  examples: [issueAssigned],
  parsePayload: (payload) => payload as IssuesAssignedEvent,
  runProperties: (payload) => [
    ...issueProperties(payload),
    {
      label: 'Assignee',
      text: payload.assignee?.login ?? 'none',
      url: payload.assignee?.html_url
    }
  ]
};

const onIssueComment: EventSpecification<IssueCommentEvent> = {
  name: 'issue_comment',
  title: 'On issue comment',
  source: 'github.com',
  icon: 'github',
  filter: {
    action: ['created']
  },
  examples: [issueCommentCreated],
  parsePayload: (payload) => payload as IssueCommentEvent,
  runProperties: (payload) => [
    ...issueProperties(payload),
    {
      label: 'Comment body',
      text: truncate(payload.comment.body, 40),
      url: payload.comment.html_url
    }
  ]
};

const onIssueLabel: EventSpecification<IssuesLabeledEvent> = {
  name: 'issues',
  title: 'On issue label',
  source: 'github.com',
  icon: 'github',
  filter: {
    action: ['labeled']
  },
  examples: [issueLabeled],
  parsePayload: (payload) => payload as IssuesLabeledEvent,
  runProperties: (payload) => [
    ...issueProperties(payload),
    {
      label: 'Issue label',
      text: payload.label?.name as string,
      url: payload.label?.url
    }
  ]
};

const onIssueUnlabel: EventSpecification<IssuesUnlabeledEvent> = {
  name: 'issues',
  title: 'On issue unlabel',
  source: 'github.com',
  icon: 'github',
  filter: {
    action: ['unlabeled']
  },
  examples: [issueUnlabeled],
  parsePayload: (payload) => payload as IssuesUnlabeledEvent,
  runProperties: (payload) => [
    ...issueProperties(payload),
    {
      label: 'Issue label',
      text: payload.label?.name as string,
      url: payload.label?.url
    }
  ]
};

function issueProperties(payload: IssuesEvent | IssueCommentEvent | IssuesLabeledEvent) {
  return [
    {
      label: 'Issue',
      text: `#${payload.issue.number}: ${payload.issue.title}`,
      url: payload.issue.html_url
    },
    {
      label: 'Author',
      text: payload.sender.login,
      url: payload.sender.html_url
    }
  ];
}

const onStar: EventSpecification<StarEvent> = {
  name: 'star',
  title: 'On star',
  source: 'github.com',
  icon: 'github',
  examples: [starredRepo],
  parsePayload: (payload) => payload as StarEvent,
  runProperties: (payload) => starProperties(payload)
};

const onNewStar: EventSpecification<StarCreatedEvent> = {
  name: 'star',
  title: 'On new star',
  source: 'github.com',
  icon: 'github',
  filter: {
    action: ['created']
  },
  examples: [starredRepo],
  parsePayload: (payload) => payload as StarCreatedEvent,
  runProperties: (payload) => starProperties(payload)
};

function starProperties(payload: StarEvent) {
  return [
    {
      label: 'Repo',
      text: `${payload.repository.name}`,
      url: payload.repository.html_url
    },
    {
      label: 'Author',
      text: payload.sender.login,
      url: payload.sender.html_url
    },
    {
      label: 'Star count',
      text: `${payload.repository.stargazers_count}`,
      url: payload.repository.stargazers_url
    }
  ];
}

const onNewRepository: EventSpecification<RepositoryCreatedEvent> = {
  name: 'repository',
  title: 'On new repository',
  source: 'github.com',
  icon: 'github',
  filter: {
    action: ['created']
  },
  parsePayload: (payload) => payload as RepositoryCreatedEvent
};

const onNewBranchOrTag: EventSpecification<CreateEvent> = {
  name: 'create',
  title: 'On new branch or tag',
  source: 'github.com',
  icon: 'github',
  parsePayload: (payload) => payload as CreateEvent,
  runProperties: (payload) => branchTagProperties(payload)
};

const onNewBranch: EventSpecification<CreateEvent> = {
  name: 'create',
  title: 'On new branch tag',
  source: 'github.com',
  icon: 'github',
  filter: {
    ref_type: ['branch']
  },
  examples: [newBranch],
  parsePayload: (payload) => payload as CreateEvent,
  runProperties: (payload) => branchTagProperties(payload)
};

function branchTagProperties(payload: CreateEvent) {
  return [
    {
      label: 'Repo',
      text: payload.repository.name,
      url: payload.repository.html_url
    },
    {
      label: payload.ref_type === 'branch' ? 'Branch' : 'Tag',
      text: payload.ref
    }
  ];
}

const onPush: EventSpecification<PushEvent> = {
  name: 'push',
  title: 'On push',
  source: 'github.com',
  icon: 'github',
  examples: [push],
  parsePayload: (payload) => payload as PushEvent,
  runProperties: (payload) => {
    const props = [
      {
        label: 'Repo',
        text: payload.repository.name,
        url: payload.repository.html_url
      },
      {
        label: 'Branch',
        text: payload.ref
      },
      {
        label: 'Pusher',
        text: payload.pusher.name
      },
      {
        label: 'Commits',
        text: `${payload.commits.length}`
      }
    ];

    if (payload.head_commit) {
      props.push({
        label: 'Head commit',
        text: payload.head_commit.id,
        url: payload.head_commit.url
      });
    }

    return props;
  }
};

const onPullRequest: EventSpecification<PullRequestEvent> = {
  name: 'pull_request',
  title: 'On pull request',
  source: 'github.com',
  icon: 'github',
  examples: [pullRequestOpened],
  parsePayload: (payload) => payload as PullRequestEvent,
  runProperties: (payload) => [
    {
      label: 'Repo',
      text: payload.repository.name,
      url: payload.repository.html_url
    },
    {
      label: 'action',
      text: payload.action
    },
    {
      label: 'Number',
      text: `${payload.number}`
    },
    {
      label: 'Title',
      text: payload.pull_request.title
    },
    {
      label: 'Author',
      text: payload.pull_request.user.login,
      url: payload.pull_request.user.html_url
    },
    {
      label: 'Commits',
      text: `${payload.pull_request.commits}`
    },
    {
      label: 'Body',
      text: truncate(payload.pull_request.body ?? 'none', 40)
    }
  ]
};

const onPullRequestReview: EventSpecification<PullRequestReviewEvent> = {
  name: 'pull_request_review',
  title: 'On pull request review',
  source: 'github.com',
  icon: 'github',
  examples: [pullRequestReviewSubmitted],
  parsePayload: (payload) => payload as PullRequestReviewEvent,
  runProperties: (payload) => [
    {
      label: 'Repo',
      text: payload.repository.name,
      url: payload.repository.html_url
    },
    {
      label: 'action',
      text: payload.action
    },
    {
      label: 'Author',
      text: payload.review.user.login,
      url: payload.review.user.html_url
    },
    {
      label: 'Body',
      text: truncate(payload.review.body ?? 'none', 40)
    },
    {
      label: 'PR Number',
      text: `${payload.pull_request.number}`
    },
    {
      label: 'PR Title',
      text: payload.pull_request.title
    }
  ]
};

const onCheckRun: EventSpecification<CheckRunEvent> = {
  name: 'check_run',
  title: 'On check run',
  source: 'github.com',
  icon: 'github',
  examples: [checkRunCreated],
  parsePayload: (payload) => payload as CheckRunEvent,
  runProperties: (payload) => [
    {
      label: 'Repo',
      text: payload.repository.name,
      url: payload.repository.html_url
    },
    {
      label: 'action',
      text: payload.action
    },
    {
      label: 'Author',
      text: payload.sender.login,
      url: payload.sender.html_url
    },
    {
      label: 'Check Name',
      text: payload.check_run.name
    },
    {
      label: 'Check Commit sha',
      text: payload.check_run.head_sha
    }
  ]
};

const onCheckSuite: EventSpecification<CheckSuiteEvent> = {
  name: 'check_suite',
  title: 'On check suite',
  source: 'github.com',
  icon: 'github',
  examples: [checkSuiteCompleted],
  parsePayload: (payload) => payload as CheckSuiteEvent,
  runProperties: (payload) => [
    {
      label: 'Repo',
      text: payload.repository.name,
      url: payload.repository.html_url
    },
    {
      label: 'action',
      text: payload.action
    },
    {
      label: 'Author',
      text: payload.sender.login,
      url: payload.sender.html_url
    },
    {
      label: 'Check Suite ID',
      text: `${payload.check_suite.id}`
    },
    {
      label: 'Check Suite sha',
      text: payload.check_suite.head_sha
    }
  ]
};

export const events = {
  /** When any action is performed on an issue  */
  onIssue,
  /** When an issue is opened  */
  onIssueOpened,
  /** When an issue is assigned  */
  onIssueAssigned,
  /** When an issue is commented on  */
  onIssueComment,
  /** When an issue is labeled on  */
  onIssueLabel,
  /** When an issue is unlabeled on  */
  onIssueUnlabel,
  /** When a repo is starred or unstarred  */
  onStar,
  /** When a repo is starred  */
  onNewStar,
  /** When a new repo is created  */
  onNewRepository,
  /** When a new branch or tag is created  */
  onNewBranchOrTag,
  /** When a new branch is created  */
  onNewBranch,
  /** When a push is made to a repo  */
  onPush,
  /** When activity occurs on a pull request. Doesn't include reviews, issues or comments. */
  onPullRequest,
  /** When Pull Request review has activity. */
  onPullRequestReview,
  /** When activity occurs on a check run */
  onCheckRun,
  /** When activity occurs on a check suite */
  onCheckSuite
};

// params.event has to be a union of all the values of the exports events object
type GitHubEvents = (typeof events)[keyof typeof events];

type CreateRepoTriggerReturnType = <TEventSpecification extends GitHubEvents>(args: {
  event: TEventSpecification;
  owner: string;
  repo: string;
}) => ExternalSourceTrigger<TEventSpecification, ReturnType<typeof createRepoEventSource>>;

function createRepoTrigger(
  source: ReturnType<typeof createRepoEventSource>
): CreateRepoTriggerReturnType {
  return <TEventSpecification extends GitHubEvents>({
    event,
    owner,
    repo
  }: {
    event: TEventSpecification;
    owner: string;
    repo: string;
  }) => {
    return new ExternalSourceTrigger({
      event,
      params: { owner, repo },
      source,
      options: {}
    });
  };
}

type CreateOrgTriggerReturnType = <TEventSpecification extends GitHubEvents>(args: {
  event: TEventSpecification;
  org: string;
}) => ExternalSourceTrigger<TEventSpecification, ReturnType<typeof createOrgEventSource>>;

function createOrgTrigger(
  source: ReturnType<typeof createOrgEventSource>
): CreateOrgTriggerReturnType {
  return <TEventSpecification extends GitHubEvents>({
    event,
    org
  }: {
    event: TEventSpecification;
    org: string;
  }) => {
    return new ExternalSourceTrigger({
      event,
      params: { org },
      source,
      options: {}
    });
  };
}

export function isRequestError(error: unknown): error is RequestError {
  return typeof error === 'object' && error !== null && 'status' in error;
}

export function onError(error: unknown) {
  if (!isRequestError(error)) {
    return;
  }

  // Check if this is a rate limit error
  if (error.status === 403 && error.response) {
    const rateLimitRemaining = error.response.headers['x-ratelimit-remaining'];
    const rateLimitReset = error.response.headers['x-ratelimit-reset'];

    if (rateLimitRemaining === '0' && rateLimitReset) {
      const resetDate = new Date(Number(rateLimitReset) * 1000);

      return {
        retryAt: resetDate,
        error
      };
    }
  }
}
