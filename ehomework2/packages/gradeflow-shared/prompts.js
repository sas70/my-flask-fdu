/**
 * Load customizable prompts from Firestore, falling back to hardcoded defaults.
 */
const { getFirestore } = require("firebase-admin/firestore");

function db() {
  return getFirestore();
}

async function getPrompt(key) {
  try {
    const doc = await db().collection("systemPrompts").doc(key).get();
    if (doc.exists) {
      return doc.data().value;
    }
  } catch (e) {
    console.warn(`⚠️ Could not load prompt "${key}" from Firestore, using default`, e.message);
  }
  return null; // caller uses hardcoded default
}

module.exports = { getPrompt };
