import { getConfig } from '@expo/config';
import { Command, flags } from '@oclif/command';
import chalk from 'chalk';
import CliTable from 'cli-table3';
import gql from 'graphql-tag';

import { graphqlClient, withErrorHandlingAsync } from '../../graphql/client';
import { BranchesByAppQuery, BranchesByAppQueryVariables } from '../../graphql/generated';
import Log from '../../log';
import { findProjectRootAsync, getProjectIdAsync } from '../../project/projectUtils';
import { UPDATE_COLUMNS, formatUpdate, getPlatformsForGroup } from '../../update/utils';

const BRANCHES_LIMIT = 10_000;

export async function listBranchesAsync({ projectId }: { projectId: string }) {
  const data = await withErrorHandlingAsync(
    graphqlClient
      .query<BranchesByAppQuery, BranchesByAppQueryVariables>(
        gql`
          query BranchesByAppQuery($appId: String!, $limit: Int!) {
            app {
              byId(appId: $appId) {
                id
                updateBranches(offset: 0, limit: $limit) {
                  id
                  name
                  updates(offset: 0, limit: 10) {
                    id
                    actor {
                      __typename
                      id
                      ... on User {
                        username
                      }
                      ... on Robot {
                        firstName
                      }
                    }
                    createdAt
                    message
                    runtimeVersion
                    group
                    platform
                  }
                }
              }
            }
          }
        `,
        {
          appId: projectId,
          limit: BRANCHES_LIMIT,
        }
      )
      .toPromise()
  );

  return data?.app?.byId.updateBranches ?? [];
}

export default class BranchList extends Command {
  static hidden = true;

  static description = 'List all branches on this project.';

  static flags = {
    json: flags.boolean({
      description: 'return output as JSON',
      default: false,
    }),
  };

  async run() {
    const { flags } = this.parse(BranchList);

    const projectDir = await findProjectRootAsync(process.cwd());
    if (!projectDir) {
      throw new Error('Please run this command inside a project directory.');
    }
    const { exp } = getConfig(projectDir, { skipSDKVersionRequirement: true });
    const projectId = await getProjectIdAsync(exp);
    const branches = await listBranchesAsync({ projectId });
    if (flags.json) {
      Log.log(JSON.stringify(branches, null, 2));
    } else {
      const table = new CliTable({
        head: ['branch', ...UPDATE_COLUMNS],
        wordWrap: true,
      });

      table.push(
        ...branches.map(branch => [
          branch.name,
          formatUpdate(branch.updates[0]),
          branch.updates[0]?.runtimeVersion ?? 'N/A',
          branch.updates[0]?.group ?? 'N/A',
          getPlatformsForGroup({
            updates: branch.updates,
            group: branch.updates[0]?.group,
          }),
        ])
      );

      Log.addNewLineIfNone();
      Log.log(chalk.bold('Branches with their most recent update group:'));
      Log.log(table.toString());
      if (branches.length >= BRANCHES_LIMIT) {
        Log.warn(`Showing first ${BRANCHES_LIMIT} branches, some results might be omitted.`);
      }
    }
  }
}
