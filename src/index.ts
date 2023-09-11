import * as core from '@actions/core'
import * as github from '@actions/github'
import type { GitHub } from '@actions/github/lib/utils'
import * as exec from '@actions/exec'
import path from 'path'

type CliPreviewResponse = {
  added: number
  changed: number
  deleted: number
  url: string
}

const COMMENT_IDENTIFIER = '<!-- STELLATE-COMMENT -->'

function formatComment(cliOutput: CliPreviewResponse) {
  const markdown = `
${COMMENT_IDENTIFIER}
## Stellate GraphQL Edge Caching Changes
:new: Cache rules added: **${cliOutput.added}**
:no_entry_sign: Cache rules removed: **${cliOutput.deleted}**
:arrows_counterclockwise: Cache rules changed: **${cliOutput.changed}**

[See the specific impact these rules changes will have on your production traffic](${cliOutput.url}).
`
  return markdown
}

async function findStellateConfigDirectory(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
  pullNumber: number
) {
  const pattern = /stellate\.(ts|js|mjs|yml)$/
  let found

  for await (const files of octokit.paginate.iterator(
    octokit.rest.pulls.listFiles,
    {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100
    }
  )) {
    found = files.data.find(
      f =>
        (f.status === 'added' || f.status === 'modified') &&
        pattern.test(f.filename)
    )

    if (found) {
      break
    }
  }

  if (found) {
    return path.dirname(found.filename)
  }

  return null
}

async function executeCliPreviewCommand(stellateConfigDirectory: string) {
  let output = ''
  let error = ''

  const options: exec.ExecOptions = {
    cwd: `./${stellateConfigDirectory}`,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString()
      },
      stderr: (data: Buffer) => {
        error += data.toString()
      }
    }
  }

  const exitCode = await exec.exec(
    'npx',
    // The --yes flag is used to suppress the warning 'The following package was not found and will be installed'
    ['--yes', 'stellate@2.4.0', 'config', 'preview', '--json'],
    options
  )

  if (exitCode !== 0) {
    throw new Error(
      `The command exited with code: ${exitCode}. Error: ${error}`
    )
  }

  if (error) {
    throw new Error(`The command returned an error: ${error}`)
  }

  const parsedOutput: CliPreviewResponse = JSON.parse(output)

  return parsedOutput
}

async function getExistingComment(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
  issueNumber: number
) {
  let found

  for await (const comments of octokit.paginate.iterator(
    octokit.rest.issues.listComments,
    {
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100
    }
  )) {
    found = comments.data.find(({ body }) => {
      return (body?.search(COMMENT_IDENTIFIER) ?? -1) > -1
    })

    if (found) {
      break
    }
  }

  if (found) {
    const { id, body } = found
    return { id, body }
  }

  return
}

async function createComment(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
) {
  const createdComment = await octokit.rest.issues.createComment({
    issue_number: issueNumber,
    owner,
    repo,
    body
  })

  return createdComment.data
}

async function updateComment(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
  existingCommentId: number,
  body: string
) {
  const updatedComment = await octokit.rest.issues.updateComment({
    comment_id: existingCommentId,
    owner,
    repo,
    body
  })

  return updatedComment.data
}

export async function run() {
  try {
    const repoToken = core.getInput('repo-token', { required: true })
    const stellateToken = core.getInput('stellate-token', { required: true })
    // We need to set the STELLATE_TOKEN environment variable so that the
    // stellate CLI can authenticate with the Stellate API.
    process.env.STELLATE_TOKEN = stellateToken

    const octokit = github.getOctokit(repoToken)
    const { owner, repo } = github.context.repo
    const { number } = github.context.issue

    if (github.context.eventName !== 'pull_request') {
      core.setFailed('This action only works for pull_request events.')
      return
    }

    const stellateConfigDirectory = await findStellateConfigDirectory(
      octokit,
      owner,
      repo,
      number
    )

    if (!stellateConfigDirectory) {
      return
    }

    const cliOutput = await executeCliPreviewCommand(stellateConfigDirectory)

    if (
      cliOutput.added === 0 &&
      cliOutput.changed === 0 &&
      cliOutput.deleted === 0
    ) {
      return
    }

    const commentBody = formatComment(cliOutput)

    const existingComment = await getExistingComment(
      octokit,
      owner,
      repo,
      number
    )

    if (existingComment) {
      const { id } = existingComment
      await updateComment(octokit, owner, repo, id, commentBody)
    } else {
      await createComment(octokit, owner, repo, number, commentBody)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run()
