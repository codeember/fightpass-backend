// seed.js - Add sample events and test user
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('fightpass.db');

async function seed() {
  console.log('🌱 Seeding database...');

  // Create test user
  const hashedPassword = await bcrypt.hash('test123', 10);
  const userId = 'user_test123';
  
  try {
    db.prepare(`
      INSERT OR REPLACE INTO users (id, email, password, name, token_balance)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, 'test@fightpass.com', hashedPassword, 'Test User', 500);
    
    console.log('✅ Created test user: test@fightpass.com / test123 (500 tokens)');
  } catch (error) {
    console.log('ℹ️  Test user already exists');
  }

  // Sample events
  const events = [
    {
      id: 'evt_live_championship',
      title: 'UFC Championship Night',
      subtitle: 'Main Event: Heavyweight Title Fight',
      description: 'The biggest fight of the year! Watch live as two champions collide.',
      is_live: 1,
      viewers: 12543,
      price: 50,
      start_time: new Date().toISOString(),
      youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    },
    {
      id: 'evt_live_bjj',
      title: 'International BJJ Championship',
      subtitle: 'Black Belt Finals',
      description: 'Top grapplers from around the world compete for the championship.',
      is_live: 1,
      viewers: 3241,
      price: 30,
      start_time: new Date().toISOString(),
      youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    },
    {
      id: 'evt_upcoming_1',
      title: 'Summer Combat Showdown',
      subtitle: 'Preliminary Matches',
      description: 'Rising stars battle it out in this exciting preliminary card.',
      is_live: 0,
      viewers: 0,
      price: 25,
      start_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
      youtube_url: null
    },
    {
      id: 'evt_upcoming_2',
      title: 'Kickboxing World Series',
      subtitle: 'Round 1',
      description: 'Elite kickboxers compete in the opening round of the championship series.',
      is_live: 0,
      viewers: 0,
      price: 35,
      start_time: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks from now
      youtube_url: null
    },
    {
      id: 'evt_upcoming_3',
      title: 'Amateur MMA Fights',
      subtitle: 'Local Talent Showcase',
      description: 'Watch tomorrow\'s champions today in this exciting amateur showcase.',
      is_live: 0,
      viewers: 0,
      price: 15,
      start_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
      youtube_url: null
    }
  ];

  events.forEach(event => {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO events (
          id, title, subtitle, description, is_live, viewers, 
          price, start_time, youtube_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.id,
        event.title,
        event.subtitle,
        event.description,
        event.is_live,
        event.viewers,
        event.price,
        event.start_time,
        event.youtube_url
      );
      
      const status = event.is_live ? '🔴 LIVE' : '📅 Upcoming';
      console.log(`✅ Added event: ${status} ${event.title} (${event.price} tokens)`);
    } catch (error) {
      console.log(`ℹ️  Event already exists: ${event.title}`);
    }
  });

  console.log('\n✨ Database seeded successfully!');
  console.log('\n📝 Test Credentials:');
  console.log('   Email: test@fightpass.com');
  console.log('   Password: test123');
  console.log('   Token Balance: 500 tokens');
  console.log('\n📊 Sample Data:');
  console.log(`   ${events.filter(e => e.is_live).length} live events`);
  console.log(`   ${events.filter(e => !e.is_live).length} upcoming events`);
  
  db.close();
}

seed().catch(error => {
  console.error('❌ Seed error:', error);
  process.exit(1);
});
