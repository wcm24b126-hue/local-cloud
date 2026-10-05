import { NavigationProduct } from '../types';
import { isLabEnabled } from '../sim/mode';

export const NAVIGATION_PRODUCTS: NavigationProduct[] = [
  {
    id: 'billing',
    title: 'Billing',
    iconName: 'CreditCard',
    path: 'billing',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Cost Management',
        items: [
          { title: 'Overview', path: 'billing' },
          { title: 'Budgets & alerts', path: 'billing-budgets' },
          { title: 'Cost table & reports', path: 'billing-reports' },
        ]
      },
      {
        groupTitle: 'Administration',
        items: [
          { title: 'Payment method', path: 'billing-payment' },
          { title: 'Linked projects', path: 'billing-projects' },
          { title: 'Billing export', path: 'billing-export' },
        ]
      }
    ]
  },
  {
    id: 'iam',
    title: 'IAM and admin',
    iconName: 'ShieldCheck',
    path: 'iam',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Access Control',
        items: [
          { title: 'IAM (Permissions)', path: 'iam' },
          { title: 'Roles', path: 'iam-roles' },
          { title: 'Service accounts', path: 'iam-service-accounts' },
          { title: 'Workload identity federation', path: 'iam-workload' },
        ]
      },
      {
        groupTitle: 'Governance & Auditing',
        items: [
          { title: 'Audit logs', path: 'iam-audit' },
          { title: 'Organization policies', path: 'iam-policies' },
          { title: 'Manage resources', path: 'iam-resources' },
        ]
      }
    ]
  },
  {
    id: 'marketplace',
    title: 'Marketplace',
    iconName: 'ShoppingBag',
    path: 'marketplace',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Explore Solutions',
        items: [
          { title: 'Explore solutions', path: 'marketplace' },
          { title: 'Virtual machine solutions', path: 'marketplace-vm' },
          { title: 'Container images', path: 'marketplace-containers' },
        ]
      }
    ]
  },
  {
    id: 'apis',
    title: 'APIs and services',
    iconName: 'Cpu',
    path: 'apis',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Management',
        items: [
          { title: 'Enabled APIs & services', path: 'apis' },
          { title: 'Library (API Catalog)', path: 'apis-library' },
          { title: 'Credentials & API keys', path: 'apis-credentials' },
          { title: 'OAuth consent screen', path: 'apis-oauth' },
        ]
      },
      {
        groupTitle: 'Metrics',
        items: [
          { title: 'Quotas & system limits', path: 'apis-quotas' },
          { title: 'Traffic metrics', path: 'apis-metrics' },
        ]
      }
    ]
  },
  {
    id: 'agent',
    title: 'Agent Platform',
    iconName: 'Bot',
    path: 'agent-platform',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Agents & Workflows',
        items: [
          { title: 'Agent Studio', path: 'agent-studio' },
          { title: 'Playbooks', path: 'agent-playbooks' },
          { title: 'Connected Tools', path: 'agent-tools' },
        ]
      }
    ]
  },
  {
    id: 'compute',
    title: 'Compute Engine',
    iconName: 'Server',
    path: 'compute',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Virtual Machines',
        items: [
          { title: 'VM instances', path: 'compute' },
          { title: 'Create instance', path: 'vm-create' },
          { title: 'Instance templates', path: 'compute-templates' },
          { title: 'Instance groups', path: 'compute-groups' },
        ]
      },
      {
        groupTitle: 'Storage & Images',
        items: [
          { title: 'Disks', path: 'compute-disks' },
          { title: 'Snapshots', path: 'compute-snapshots' },
          { title: 'Machine images', path: 'compute-images' },
        ]
      },
      {
        groupTitle: 'Operations',
        items: [
          { title: 'Operations log', path: 'compute-operations' },
          { title: 'Sole-tenant nodes', path: 'compute-nodes' },
        ]
      }
    ]
  },
  {
    id: 'gke',
    title: 'Kubernetes Engine',
    iconName: 'Layers',
    path: 'gke',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Clusters & Workloads',
        items: [
          { title: 'Clusters', path: 'gke' },
          { title: 'Workloads', path: 'gke-workloads' },
          { title: 'Services & Ingress', path: 'gke-services' },
          { title: 'Storage & Config', path: 'gke-storage' },
        ]
      }
    ]
  },
  {
    id: 'storage',
    title: 'Cloud Storage',
    iconName: 'Archive',
    path: 'storage',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Storage Management',
        items: [
          { title: 'Buckets', path: 'storage' },
          { title: 'Create bucket', path: 'bucket-create' },
          { title: 'Data transfer', path: 'storage-transfer' },
          { title: 'Monitoring & metrics', path: 'storage-monitoring' },
          { title: 'Settings', path: 'storage-settings' },
        ]
      }
    ]
  },
  {
    id: 'security',
    title: 'Security',
    iconName: 'Lock',
    path: 'security',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Threat & Risk',
        items: [
          { title: 'Security Command Center', path: 'security-scc' },
          { title: 'Vulnerability scans', path: 'security-scans' },
        ]
      },
      {
        groupTitle: 'Key Management & Secrets',
        items: [
          { title: 'Secret Manager', path: 'secret-manager' },
          { title: 'KMS Keyrings', path: 'kms' },
        ]
      }
    ]
  },
  {
    id: 'bigquery',
    title: 'BigQuery',
    iconName: 'Database',
    path: 'bigquery',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Analytics Studio',
        items: [
          { title: 'SQL Workspace', path: 'bigquery' },
          { title: 'Datasets & tables', path: 'bigquery-datasets' },
          { title: 'Scheduled queries', path: 'bigquery-scheduled' },
          { title: 'Data transfers', path: 'bigquery-transfers' },
        ]
      }
    ]
  },
  {
    id: 'monitoring',
    title: 'Monitoring',
    iconName: 'BarChart2',
    path: 'monitoring',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Observability',
        items: [
          { title: 'Dashboards', path: 'monitoring' },
          { title: 'Metrics explorer', path: 'monitoring-metrics' },
          { title: 'Alerting policies', path: 'monitoring-alerting' },
          { title: 'Uptime checks', path: 'monitoring-uptime' },
        ]
      },
      {
        groupTitle: 'Operations Logging',
        items: [
          { title: 'Logs Explorer', path: 'logging-explorer' },
          { title: 'Log router & sinks', path: 'logging-sinks' },
        ]
      }
    ]
  },
  {
    id: 'run',
    title: 'Cloud Run',
    iconName: 'CloudLightning',
    path: 'run',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Serverless Compute',
        items: [
          { title: 'Services', path: 'run' },
          { title: 'Jobs', path: 'run-jobs' },
          { title: 'Custom domains', path: 'run-domains' },
        ]
      }
    ]
  },
  {
    id: 'pubsub',
    title: 'Pub/Sub',
    iconName: 'Radio',
    path: 'pubsub',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Messaging',
        items: [
          { title: 'Topics', path: 'pubsub-topics' },
          { title: 'Subscriptions', path: 'pubsub-subscriptions' },
          { title: 'Schemas', path: 'pubsub-schemas' },
          { title: 'Snapshots', path: 'pubsub-snapshots' },
        ]
      }
    ]
  },
  {
    id: 'vpc',
    title: 'VPC network',
    iconName: 'Network',
    path: 'vpc',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Networking',
        items: [
          { title: 'VPC networks', path: 'vpc' },
          { title: 'External IP addresses', path: 'vpc-ips' },
          { title: 'Firewall rules', path: 'vpc-firewalls' },
          { title: 'Routes', path: 'vpc-routes' }
        ]
      }
    ]
  },
  {
    id: 'netlab',
    title: 'Networking lab',
    iconName: 'Network',
    path: 'netlab-overview',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Simulation',
        items: [
          { title: 'Lab overview', path: 'netlab-overview' },
          // Hidden when ENABLE_LAB is false, matching NetLabSection.
          ...(isLabEnabled() ? [{ title: 'Guided lab', path: 'netlab-guided' }] : []),
          { title: 'Lab VPC networks', path: 'netlab-vpc' },
          { title: 'Lab subnetworks', path: 'netlab-subnets' },
          { title: 'Lab VM instances', path: 'netlab-vms' },
          { title: 'Lab persistent disks', path: 'netlab-disks' },
          { title: 'Lab routes', path: 'netlab-routes' },
          { title: 'Lab load balancing', path: 'netlab-loadbalancers' },
          { title: 'Lab firewall policies', path: 'netlab-firewall' },
          { title: 'Lab packet tracer', path: 'netlab-tracer' },
          { title: 'Lab topology', path: 'netlab-topology' }
        ]
      }
    ]
  },
  {
    id: 'databases',
    title: 'Databases',
    iconName: 'HardDrive',
    path: 'databases',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Database Hub',
        items: [
          { title: 'Overview', path: 'databases' },
          { title: 'Database Migration Service', path: 'databases-migration' },
        ]
      }
    ]
  },
  {
    id: 'sql',
    title: 'Cloud SQL',
    iconName: 'Layers',
    path: 'sql',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Relational Instances',
        items: [
          { title: 'Instances', path: 'sql' },
          { title: 'Databases', path: 'sql-databases' },
          { title: 'Users & privileges', path: 'sql-users' },
          { title: 'Backups & replicas', path: 'sql-backups' },
        ]
      }
    ]
  },
  {
    id: 'maps',
    title: 'Google Maps Platform',
    iconName: 'MapPin',
    path: 'maps',
    hasSubmenu: true,
    subgroups: [
      {
        groupTitle: 'Geospatial APIs',
        items: [
          { title: 'Overview', path: 'maps' },
          { title: 'APIs & Services', path: 'maps-apis' },
          { title: 'Keys & Credentials', path: 'maps-credentials' },
        ]
      }
    ]
  }
];
