/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * These should be run as if the action was called from a workflow.
 * Specifically, the inputs listed in `action.yml` should be set as environment
 * variables following the pattern `INPUT_<INPUT_NAME>`.
 */

import * as core from '@actions/core'
import * as main from '../src/main'
import * as initializer from '../src/initializer'
import { Git } from '../src/git'
import * as github from '@actions/github'

function pullRequestEventContext(overrides = {}): object {
  return {
    eventName: 'pull_request',
    repo: {
      owner: 'lerebear',
      name: 'sizeup-action'
    },
    payload: {
      pull_request: {
        base: {
          ref: 'main',
          repo: {
            full_name: 'lerebear/sizeup-action',
            name: 'sizeup-action',
            owner: {
              login: 'lerebear'
            }
          }
        },
        head: {
          ref: 'topic'
        },
        number: 1,
        user: {
          login: 'lerebear'
        },
        ...overrides
      }
    }
  }
}

describe('action', () => {
  // Mock Octokit so that by default it return a small diff and allow an existing label to be applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(github, 'getOctokit').mockImplementation((token: string): any => {
    if (token === 'xxx') {
      return {
        paginate: () => [],
        rest: {
          issues: {
            getLabel: () => {},
            addLabels: () => {},
            listComments: () => {}
          }
        }
      }
    }
  })
  const loadConfigurationMock = jest
    .spyOn(initializer, 'loadConfiguration')
    .mockImplementation(() => ({
      commenting: { excludeDraftPullRequests: true }
    }))
  const setOutputMock = jest
    .spyOn(core, 'setOutput')
    .mockImplementation(() => {})
  const setFailedMock = jest
    .spyOn(core, 'setFailed')
    .mockImplementation(() => {})
  const infoMock = jest.spyOn(core, 'info').mockImplementation(() => {})

  // Mock the action's main function
  const runMock = jest.spyOn(main, 'run')

  // Shallow clone original @actions/github context
  const originalContext = { ...github.context }

  // Mock cloning the repo
  jest.spyOn(Git.prototype, 'clone').mockImplementation(async () => {})

  // Mock the diff that we use for evaluation.
  jest
    .spyOn(Git.prototype, 'diff')
    .mockImplementation(async () =>
      Promise.resolve(
        '--- README.md	2023-10-16 16:35:38\n+++ README-AGAIN.md	2023-10-16 16:36:07\n@@ -0,0 +1 @@\n+# Hello, World!'
      )
    )

  // Mock core.getInput() such that we verify that we retrieve the auth token
  // from the right input variable.
  jest.spyOn(core, 'getInput').mockImplementation((name: string): string => {
    switch (name) {
      case 'token':
        return 'xxx'
      default:
        return ''
    }
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    // Restore original @actions/github context
    Object.defineProperty(github, 'context', { value: originalContext })
  })

  it('sets the score and category outputs', async () => {
    // Mock the @actions/github context.
    Object.defineProperty(github, 'context', {
      value: pullRequestEventContext()
    })

    await main.run()

    expect(runMock).toHaveReturned()
    expect(setFailedMock).not.toHaveBeenCalled()
    expect(setOutputMock).toHaveBeenNthCalledWith(1, 'score', 1)
    expect(setOutputMock).toHaveBeenNthCalledWith(2, 'category', 'extra small')
  })

  it('skips labelling a draft pull request when configured to do so', async () => {
    // Mock the @actions/github context.
    Object.defineProperty(github, 'context', {
      value: pullRequestEventContext({ draft: true })
    })

    loadConfigurationMock.mockImplementation(() => ({
      labeling: { excludeDraftPullRequests: true }
    }))

    await main.run()

    expect(runMock).toHaveReturned()
    expect(setFailedMock).not.toHaveBeenCalled()
    expect(infoMock).toHaveBeenCalledWith(
      'Skipping labeling of a draft pull request'
    )
  })

  it('skips labelling a pull request when running in shadow mode', async () => {
    // Mock the @actions/github context.
    Object.defineProperty(github, 'context', {
      value: pullRequestEventContext()
    })

    loadConfigurationMock.mockImplementation(() => ({
      // Mock config such that the only opted-in user is @glortho. The pull request will be created
      // by @lerebear, who should therefore *not* be considered opted in.
      optIns: ['glortho'],
      shadowOptOuts: true
    }))

    await main.run()

    expect(runMock).toHaveReturned()
    expect(setFailedMock).not.toHaveBeenCalled()
    expect(infoMock).toHaveBeenCalledWith(
      'Skipping labeling because this workflow is running in shadow mode'
    )
  })

  it('skips commenting on a draft pull request when configured to do so', async () => {
    // Mock the @actions/github context.
    Object.defineProperty(github, 'context', {
      value: pullRequestEventContext({ draft: true })
    })

    loadConfigurationMock.mockImplementation(() => ({
      commenting: { scoreThreshold: 0 }
    }))

    await main.run()

    expect(runMock).toHaveReturned()
    expect(setFailedMock).not.toHaveBeenCalled()
    expect(infoMock).toHaveBeenCalledWith(
      'Skipping commenting on a draft pull request'
    )
  })

  it('skips commenting on a pull request when running in shadow mode', async () => {
    // Mock the @actions/github context.
    Object.defineProperty(github, 'context', {
      value: pullRequestEventContext()
    })

    loadConfigurationMock.mockImplementation(() => ({
      // Mock config such that the only opted-in user is @glortho. The pull request will be created
      // by @lerebear, who should therefore *not* be considered opted in.
      optIns: ['glortho'],
      shadowOptOuts: true,
      commenting: { scoreThreshold: 0 }
    }))

    await main.run()

    expect(runMock).toHaveReturned()
    expect(setFailedMock).not.toHaveBeenCalled()
    expect(infoMock).toHaveBeenCalledWith(
      'Skipping commenting because this workflow is running in shadow mode'
    )
  })

  it('skips creating a score artifact when that feature is not enabled', async () => {
    // Mock the @actions/github context.
    Object.defineProperty(github, 'context', {
      value: pullRequestEventContext()
    })

    await main.run()

    expect(runMock).toHaveReturned()
    expect(setFailedMock).not.toHaveBeenCalled()
    expect(infoMock).toHaveBeenCalledWith(
      'Skipping score artifact creation because it has not been enabled'
    )
  })

  it('skips creating a score artifact on draft pull requests by default', async () => {
    // Mock the @actions/github context.
    Object.defineProperty(github, 'context', {
      value: pullRequestEventContext({ draft: true })
    })

    loadConfigurationMock.mockImplementation(() => ({
      artifacts: {
        score: {
          format: 'csv'
        }
      }
    }))

    await main.run()

    expect(runMock).toHaveReturned()
    expect(setFailedMock).not.toHaveBeenCalled()
    expect(infoMock).toHaveBeenCalledWith(
      'Skipping score artifact creation on a draft pull request'
    )
  })

  it('runs the workflow sucessfully when optIns configuration is present and the pull request author is in it', async () => {
    // Mock the @actions/github context.
    Object.defineProperty(github, 'context', {
      value: pullRequestEventContext()
    })

    loadConfigurationMock.mockImplementation(() => ({
      // Mock config such that the only opted-in user is @glortho. The pull request will be created
      // by @lerebear, who should therefore *not* be considered opted in.
      optIns: ['lerebear']
    }))

    await main.run()

    expect(runMock).toHaveReturned()
    expect(setFailedMock).not.toHaveBeenCalled()
    expect(setOutputMock).toHaveBeenNthCalledWith(1, 'score', 1)
    expect(setOutputMock).toHaveBeenNthCalledWith(2, 'category', 'extra small')
  })

  it('skips the workflow entirely when the pull request author has not opted into it', async () => {
    // Mock the @actions/github context.
    Object.defineProperty(github, 'context', {
      value: pullRequestEventContext()
    })

    loadConfigurationMock.mockImplementation(() => ({
      // Mock config such that the only opted-in user is @glortho. The pull request will be created
      // by @lerebear, who should therefore not be considered optedpin.
      optIns: ['glortho']
    }))

    await main.run()

    expect(runMock).toHaveReturned()
    expect(setFailedMock).not.toHaveBeenCalled()
    expect(infoMock).toHaveBeenCalledWith(
      'Skipping evaluation because pull request author @lerebear has not opted into this workflow'
    )
  })

  it('sets a failed status when invoked for the wrong event', async () => {
    Object.defineProperty(github, 'context', { value: { eventName: 'push' } })

    await main.run()

    expect(runMock).toHaveReturned()
    expect(setFailedMock).toHaveBeenNthCalledWith(
      1,
      "This action is only supported on the 'pull_request' event, but it was triggered for 'push'"
    )
  })
})
