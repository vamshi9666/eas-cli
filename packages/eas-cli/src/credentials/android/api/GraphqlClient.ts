import {
  AndroidAppBuildCredentialsFragment,
  AndroidFcmFragment,
  AndroidFcmVersion,
  AndroidKeystoreFragment,
  AppFragment,
  CommonAndroidAppCredentialsFragment,
} from '../../../graphql/generated';
import { Account } from '../../../user/Account';
import { AppQuery } from '../../ios/api/graphql/queries/AppQuery';
import { KeystoreWithType } from '../credentials';
import { AndroidAppBuildCredentialsMutation } from './graphql/mutations/AndroidAppBuildCredentialsMutation';
import { AndroidAppCredentialsMutation } from './graphql/mutations/AndroidAppCredentialsMutation';
import { AndroidFcmMutation } from './graphql/mutations/AndroidFcmMutation';
import { AndroidKeystoreMutation } from './graphql/mutations/AndroidKeystoreMutation';
import { AndroidAppCredentialsQuery } from './graphql/queries/AndroidAppCredentialsQuery';

export interface AppLookupParams {
  account: Account;
  projectName: string;
  androidApplicationIdentifier: string; // 'android.package' field in app.json
}

export async function getAndroidAppCredentialsWithCommonFieldsAsync(
  appLookupParams: AppLookupParams
): Promise<CommonAndroidAppCredentialsFragment | null> {
  const { androidApplicationIdentifier } = appLookupParams;
  const projectFullName = formatProjectFullName(appLookupParams);
  return await AndroidAppCredentialsQuery.withCommonFieldsByApplicationIdentifierAsync(
    projectFullName,
    {
      androidApplicationIdentifier,
      legacyOnly: false,
    }
  );
}

export async function getAndroidAppBuildCredentialsListAsync(
  appLookupParams: AppLookupParams
): Promise<AndroidAppBuildCredentialsFragment[]> {
  const appCredentials = await getAndroidAppCredentialsWithCommonFieldsAsync(appLookupParams);
  return appCredentials?.androidAppBuildCredentialsList ?? [];
}

/* There is at most one set of legacy android app credentials associated with an Expo App */
export async function getLegacyAndroidAppCredentialsWithCommonFieldsAsync(
  appLookupParams: AppLookupParams
): Promise<CommonAndroidAppCredentialsFragment | null> {
  const projectFullName = formatProjectFullName(appLookupParams);
  return await AndroidAppCredentialsQuery.withCommonFieldsByApplicationIdentifierAsync(
    projectFullName,
    {
      legacyOnly: true,
    }
  );
}

/* There is at most one set of legacy android app build credentials associated with an Expo App */
export async function getLegacyAndroidAppBuildCredentialsAsync(
  appLookupParams: AppLookupParams
): Promise<AndroidAppBuildCredentialsFragment | null> {
  const legacyAppCredentials = await getLegacyAndroidAppCredentialsWithCommonFieldsAsync(
    appLookupParams
  );
  return legacyAppCredentials?.androidAppBuildCredentialsList[0] ?? null;
}

export async function createOrGetExistingAndroidAppCredentialsWithBuildCredentialsAsync(
  appLookupParams: AppLookupParams
): Promise<CommonAndroidAppCredentialsFragment> {
  const maybeAndroidAppCredentials = await getAndroidAppCredentialsWithCommonFieldsAsync(
    appLookupParams
  );
  if (maybeAndroidAppCredentials) {
    return maybeAndroidAppCredentials;
  } else {
    const app = await getAppAsync(appLookupParams);
    return await AndroidAppCredentialsMutation.createAndroidAppCredentialsAsync(
      {},
      app.id,
      appLookupParams.androidApplicationIdentifier
    );
  }
}

export async function updateAndroidAppCredentialsAsync(
  appCredentials: CommonAndroidAppCredentialsFragment,
  {
    androidFcmId,
  }: {
    androidFcmId: string;
  }
): Promise<CommonAndroidAppCredentialsFragment> {
  return await AndroidAppCredentialsMutation.setFcmKeyAsync(appCredentials.id, androidFcmId);
}

export async function updateAndroidAppBuildCredentialsAsync(
  buildCredentials: AndroidAppBuildCredentialsFragment,
  {
    androidKeystoreId,
  }: {
    androidKeystoreId: string;
  }
): Promise<AndroidAppBuildCredentialsFragment> {
  return await AndroidAppBuildCredentialsMutation.setKeystoreAsync(
    buildCredentials.id,
    androidKeystoreId
  );
}

export async function createAndroidAppBuildCredentialsAsync(
  appLookupParams: AppLookupParams,
  {
    name,
    isDefault,
    androidKeystoreId,
  }: {
    name: string;
    isDefault: boolean;
    androidKeystoreId: string;
  }
): Promise<AndroidAppBuildCredentialsFragment> {
  const androidAppCredentials =
    await createOrGetExistingAndroidAppCredentialsWithBuildCredentialsAsync(appLookupParams);
  const buildCredentialsList = androidAppCredentials.androidAppBuildCredentialsList;
  const existingDefaultBuildCredentials =
    buildCredentialsList.find(buildCredentials => buildCredentials.isDefault) ?? null;
  if (existingDefaultBuildCredentials && isDefault) {
    throw new Error(
      'Cannot create new default Android Build Credentials. A set of default credentials exists already.'
    );
  }

  return await AndroidAppBuildCredentialsMutation.createAndroidAppBuildCredentialsAsync(
    {
      name,
      isDefault,
      keystoreId: androidKeystoreId,
    },
    androidAppCredentials.id
  );
}

export async function getDefaultAndroidAppBuildCredentialsAsync(
  appLookupParams: AppLookupParams
): Promise<AndroidAppBuildCredentialsFragment | null> {
  const buildCredentialsList = await getAndroidAppBuildCredentialsListAsync(appLookupParams);
  return buildCredentialsList.find(buildCredentials => buildCredentials.isDefault) ?? null;
}

export async function getAndroidAppBuildCredentialsByNameAsync(
  appLookupParams: AppLookupParams,
  name: string
): Promise<AndroidAppBuildCredentialsFragment | null> {
  const buildCredentialsList = await getAndroidAppBuildCredentialsListAsync(appLookupParams);
  return buildCredentialsList.find(buildCredentials => buildCredentials.name === name) ?? null;
}

export async function createOrUpdateAndroidAppBuildCredentialsByNameAsync(
  appLookupParams: AppLookupParams,
  name: string,
  {
    androidKeystoreId,
  }: {
    androidKeystoreId: string;
  }
): Promise<AndroidAppBuildCredentialsFragment> {
  const existingBuildCredentialsWithName = await getAndroidAppBuildCredentialsByNameAsync(
    appLookupParams,
    name
  );
  if (existingBuildCredentialsWithName) {
    return await updateAndroidAppBuildCredentialsAsync(existingBuildCredentialsWithName, {
      androidKeystoreId,
    });
  }
  const defaultBuildCredentialsExist = !!(await getDefaultAndroidAppBuildCredentialsAsync(
    appLookupParams
  ));
  return await createAndroidAppBuildCredentialsAsync(appLookupParams, {
    name,
    isDefault: !defaultBuildCredentialsExist, // make default if none exist
    androidKeystoreId,
  });
}

export async function createOrUpdateDefaultIosAppBuildCredentialsAsync() {
  throw new Error('This requires user prompting. Look for me in BuildCredentialsUtils');
}

export async function createKeystoreAsync(
  account: Account,
  keystore: KeystoreWithType
): Promise<AndroidKeystoreFragment> {
  return await AndroidKeystoreMutation.createAndroidKeystore(
    {
      base64EncodedKeystore: keystore.keystore,
      keystorePassword: keystore.keystorePassword,
      keyAlias: keystore.keyAlias,
      keyPassword: keystore.keyPassword,
      type: keystore.type,
    },
    account.id
  );
}

export async function deleteKeystoreAsync(keystore: AndroidKeystoreFragment): Promise<void> {
  return await AndroidKeystoreMutation.deleteAndroidKeystore(keystore.id);
}

export async function createFcmAsync(
  account: Account,
  fcmApiKey: string,
  version: AndroidFcmVersion
): Promise<AndroidFcmFragment> {
  return await AndroidFcmMutation.createAndroidFcm({ credential: fcmApiKey, version }, account.id);
}

export async function deleteFcmAsync(fcm: AndroidFcmFragment): Promise<void> {
  return await AndroidFcmMutation.deleteAndroidFcm(fcm.id);
}

async function getAppAsync(appLookupParams: AppLookupParams): Promise<AppFragment> {
  const projectFullName = formatProjectFullName(appLookupParams);
  return await AppQuery.byFullNameAsync(projectFullName);
}

export const formatProjectFullName = ({ account, projectName }: AppLookupParams): string =>
  `@${account.name}/${projectName}`;
