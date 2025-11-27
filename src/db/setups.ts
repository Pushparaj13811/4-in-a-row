import { db } from './database.js';

console.log('🔧 Setting up database...\n');

try {
  await db.init();
  console.log('\n✅ Database setup completed successfully!');
  await db.close();
  process.exit(0);
} catch (error) {
  console.error('\n❌ Database setup failed:', error);
  process.exit(1);
}