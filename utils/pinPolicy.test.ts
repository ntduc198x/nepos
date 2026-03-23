import { SettingsService } from '../services/SettingsService';
import { POS_PIN_REGISTRY_KEY } from '../services/SettingsService';

/**
 * Unit-like checks for PIN policy.
 * 
 * 1) adminPin + adminSession => ok
 * 2) adminPin + managerSession => ok
 * 3) managerPin + staffSession => ok
 * 4) managerPin + managerSession => ok
 * 5) managerPin + adminSession => fail NOT_ALLOWED_FOR_ROLE
 * 6) staffPin other user + staffSession => fail IDENTITY_MISMATCH
 */

export const runPinPolicyTests = async () => {
    console.log("--- RUNNING PIN POLICY TESTS ---");

    // Setup mock registry
    const mockRegistry = [
        { role: 'admin', email: 'admin@test.com', pin: '1111' },
        { role: 'manager', email: 'manager@test.com', pin: '2222' },
        { role: 'staff', email: 'staff1@test.com', pin: '3333' },
        { role: 'staff', email: 'staff2@test.com', pin: '4444' }
    ];
    localStorage.setItem(POS_PIN_REGISTRY_KEY, JSON.stringify(mockRegistry));

    const adminUser = { email: 'admin@test.com' };
    const managerUser = { email: 'manager@test.com' };
    const staff1User = { email: 'staff1@test.com' };

    const runTest = async (name: string, pin: string, user: any, role: string, expectedOk: boolean, expectedReason?: string) => {
        const result = await SettingsService.verifyPin(pin, user, role);
        const passed = result.ok === expectedOk && result.reason === expectedReason;
        console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}`);
        if (!passed) {
            console.error(`  Expected: {ok: ${expectedOk}, reason: ${expectedReason}}`);
            console.error(`  Got:      {ok: ${result.ok}, reason: ${result.reason}}`);
        }
    };

    // 1) adminPin + adminSession => ok
    await runTest("1) adminPin + adminSession", '1111', adminUser, 'admin', true);

    // 2) adminPin + managerSession => ok
    await runTest("2) adminPin + managerSession", '1111', managerUser, 'manager', true);

    // 3) managerPin + staffSession => ok
    await runTest("3) managerPin + staffSession", '2222', staff1User, 'staff', true);

    // 4) managerPin + managerSession => ok
    await runTest("4) managerPin + managerSession", '2222', managerUser, 'manager', true);

    // 5) managerPin + adminSession => fail NOT_ALLOWED_FOR_ROLE
    await runTest("5) managerPin + adminSession", '2222', adminUser, 'admin', false, 'NOT_ALLOWED_FOR_ROLE');

    // 6) staffPin other user + staffSession => fail IDENTITY_MISMATCH
    await runTest("6) staffPin other user + staffSession", '4444', staff1User, 'staff', false, 'IDENTITY_MISMATCH');

    console.log("--- PIN POLICY TESTS COMPLETE ---");
};
