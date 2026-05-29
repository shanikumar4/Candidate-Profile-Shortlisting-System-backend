require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const Candidate = require('./models/Candidate');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const candidates = await Candidate.find({ matchScore: { $ne: null } });
  let count = 0;

  for (const c of candidates) {
    let changed = false;
    const newStage = c.matchScore >= 60 ? 'screening' : 'rejected';
    const isShortlisted = c.matchScore >= 60;

    // Check if we need to auto-move them out of applied
    if (c.stage === 'applied' || c.stage === undefined) {
      c.stage = newStage;
      c.stageHistory.push({ stage: newStage, enteredAt: new Date() });
      changed = true;
    }

    if (c.savedToShortlist !== isShortlisted && c.matchScore >= 60) {
      c.savedToShortlist = isShortlisted;
      changed = true;
    }
    
    // Specifically for the bug where Shani Kumar got 20 but stayed applied
    // because he was re-scored, but if the logic failed or something, we forcefully update it here.
    if (c.matchScore < 60 && c.stage !== 'rejected') {
        c.stage = 'rejected';
        c.savedToShortlist = false;
        c.stageHistory.push({ stage: 'rejected', enteredAt: new Date() });
        changed = true;
    }
    
    if (c.matchScore >= 60 && c.stage !== 'screening' && c.stage !== 'interview' && c.stage !== 'offer' && c.stage !== 'hired') {
        c.stage = 'screening';
        c.savedToShortlist = true;
        c.stageHistory.push({ stage: 'screening', enteredAt: new Date() });
        changed = true;
    }

    if (changed) {
      await c.save();
      count++;
      console.log(`Updated candidate ${c.name} (Score: ${c.matchScore}) to stage: ${c.stage}`);
    }
  }

  console.log(`Migration completed. Updated ${count} candidates.`);
  process.exit(0);
}

migrate();
