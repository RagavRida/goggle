/**
 * Legacy Auth Module (Sample for Demo)
 * 
 * This is a legacy-style file using:
 * - var instead of let/const
 * - callbacks instead of async/await
 * - standard functions (NOT arrow functions - this is a CONSTRAINT)
 */

var crypto = require('crypto');
var db = require('./db');

// Legacy session store
var sessions = {};

/**
 * Authenticate user with username and password
 * @param {string} username 
 * @param {string} password 
 * @param {Function} callback 
 */
function authenticate(username, password, callback) {
    var hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    db.findUser(username, function (err, user) {
        if (err) {
            callback(err, null);
            return;
        }

        if (!user) {
            callback(new Error('User not found'), null);
            return;
        }

        if (user.password !== hashedPassword) {
            callback(new Error('Invalid password'), null);
            return;
        }

        // Create session
        var sessionId = generateSessionId();
        sessions[sessionId] = {
            userId: user.id,
            username: user.username,
            createdAt: Date.now()
        };

        callback(null, { sessionId: sessionId, user: user });
    });
}

/**
 * Verify session token
 * @param {string} sessionId 
 * @param {Function} callback 
 */
function verifySession(sessionId, callback) {
    var session = sessions[sessionId];

    if (!session) {
        callback(new Error('Invalid session'), null);
        return;
    }

    // Check expiration (24 hours)
    var maxAge = 24 * 60 * 60 * 1000;
    if (Date.now() - session.createdAt > maxAge) {
        delete sessions[sessionId];
        callback(new Error('Session expired'), null);
        return;
    }

    callback(null, session);
}

/**
 * Logout user
 * @param {string} sessionId 
 * @param {Function} callback 
 */
function logout(sessionId, callback) {
    if (sessions[sessionId]) {
        delete sessions[sessionId];
        callback(null, { success: true });
    } else {
        callback(new Error('Session not found'), null);
    }
}

/**
 * Generate random session ID
 */
function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

module.exports = {
    authenticate: authenticate,
    verifySession: verifySession,
    logout: logout
};
