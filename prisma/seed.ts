/**
 * LocalCloud Database Seeder
 * Populates Phase 1 state matching real Google Cloud Console defaults
 */

export async function seedLocalCloud() {
  console.log('Seeding LocalCloud emulator state...');

  const initialUser = {
    email: 'student@localcloud.dev',
    name: 'Student Account',
  };

  const initialProject = {
    name: 'My First Project',
    projectId: 'optical-order-460008-i6',
    projectNumber: '460008',
  };

  const initialBilling = {
    name: 'My Billing Account',
    accountNumber: '01D5B2-99F4A1-7788C3',
    status: 'OPEN',
    virtualBalance: 300.0,
    totalSpent: 0.0,
    currency: 'USD',
  };

  const initialApis = [
    'compute.googleapis.com',
    'storage.googleapis.com',
    'iam.googleapis.com',
    'bigquery.googleapis.com',
    'logging.googleapis.com',
  ];

  const initialServiceAccounts = [
    {
      name: 'default-compute-sa',
      displayName: 'Compute Engine default service account',
      email: `${initialProject.projectNumber}-compute@developer.gserviceaccount.com`,
      description: 'Default service account used by Compute Engine instances in this project',
    },
    {
      name: 'cloud-storage-app',
      displayName: 'Cloud Storage Uploader',
      email: `cloud-storage-app@${initialProject.projectId}.iam.gserviceaccount.com`,
      description: 'Used by backend microservices to upload media to Cloud Storage buckets',
    },
  ];

  console.log('Seed completed successfully for project:', initialProject.projectId);
  return {
    user: initialUser,
    project: initialProject,
    billing: initialBilling,
    apis: initialApis,
    serviceAccounts: initialServiceAccounts,
  };
}

// Execute when run standalone via tsx/ts-node
if (typeof require !== 'undefined' && require.main === module) {
  seedLocalCloud()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
