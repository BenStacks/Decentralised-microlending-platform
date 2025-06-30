import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Ensure that contract owner can add collateral assets",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
    },
});

Clarinet.test({
    name: "Ensure that non-owner cannot add collateral assets",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let wallet1 = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("BTC")
            ], wallet1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1000)); // ERR-NOT-AUTHORIZED
    },
});

Clarinet.test({
    name: "Ensure that contract owner can update asset prices",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address),
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("STX"),
                types.uint(100000000) // $100 in microunits
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        assertEquals(block.receipts[1].result.expectOk(), types.bool(true));
    },
});

Clarinet.test({
    name: "Ensure that price update fails for invalid collateral asset",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("INVALID"),
                types.uint(100000000)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1013)); // ERR-INVALID-COLLATERAL-ASSET
    },
});

Clarinet.test({
    name: "Ensure that loan creation works with valid parameters",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let borrower = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address),
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("STX"),
                types.uint(100000000)
            ], deployer.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'create-loan-request', [
                types.uint(1000000000), // 1000 loan amount
                types.uint(3000000000), // 3000 collateral (300% ratio)
                types.ascii("STX"),
                types.uint(144000), // 100 days duration
                types.uint(1000) // 10% interest rate
            ], borrower.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));
        
        // Verify loan details
        let loanCall = chain.callReadOnlyFn('micro-lend', 'get-loan', [types.uint(1)], borrower.address);
        let loan = loanCall.result.expectSome().expectTuple();
        assertEquals(loan['borrower'], borrower.address);
        assertEquals(loan['amount'], types.uint(1000000000));
        assertEquals(loan['collateral-amount'], types.uint(3000000000));
        assertEquals(loan['status'], types.ascii("PENDING"));
    },
});

Clarinet.test({
    name: "Ensure that loan creation fails with insufficient collateral",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let borrower = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address),
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("STX"),
                types.uint(100000000)
            ], deployer.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'create-loan-request', [
                types.uint(1000000000), // 1000 loan amount
                types.uint(1500000000), // 1500 collateral (150% ratio - below 200% minimum)
                types.ascii("STX"),
                types.uint(144000),
                types.uint(1000)
            ], borrower.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1002)); // ERR-INSUFFICIENT-COLLATERAL
    },
});

Clarinet.test({
    name: "Ensure that loan creation fails with invalid duration",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let borrower = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address),
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("STX"),
                types.uint(100000000)
            ], deployer.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'create-loan-request', [
                types.uint(1000000000),
                types.uint(3000000000),
                types.ascii("STX"),
                types.uint(100), // Too short duration (below 1440 minimum)
                types.uint(1000)
            ], borrower.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1009)); // ERR-INVALID-DURATION
    },
});

Clarinet.test({
    name: "Ensure that loan creation fails with invalid interest rate",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let borrower = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address),
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("STX"),
                types.uint(100000000)
            ], deployer.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'create-loan-request', [
                types.uint(1000000000),
                types.uint(3000000000),
                types.ascii("STX"),
                types.uint(144000),
                types.uint(6000) // 60% interest rate (above 50% maximum)
            ], borrower.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1010)); // ERR-INVALID-INTEREST-RATE
    },
});

Clarinet.test({
    name: "Ensure that only owner can activate loans",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let borrower = accounts.get('wallet_1')!;
        let wallet2 = accounts.get('wallet_2')!;
        
        // Setup and create loan
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address),
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("STX"),
                types.uint(100000000)
            ], deployer.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'create-loan-request', [
                types.uint(1000000000),
                types.uint(3000000000),
                types.ascii("STX"),
                types.uint(144000),
                types.uint(1000)
            ], borrower.address)
        ]);
        
        // Non-owner tries to activate loan
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'activate-loan', [
                types.uint(1)
            ], wallet2.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1000)); // ERR-NOT-AUTHORIZED
        
        // Owner can activate loan
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'activate-loan', [
                types.uint(1)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify loan status changed
        let loanCall = chain.callReadOnlyFn('micro-lend', 'get-loan', [types.uint(1)], borrower.address);
        let loan = loanCall.result.expectSome().expectTuple();
        assertEquals(loan['status'], types.ascii("ACTIVE"));
    },
});

Clarinet.test({
    name: "Ensure that loan activation fails for non-existent loan",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'activate-loan', [
                types.uint(999) // Non-existent loan ID
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1003)); // ERR-LOAN-NOT-FOUND
    },
});

Clarinet.test({
    name: "Ensure that loan activation fails for already active loan",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let borrower = accounts.get('wallet_1')!;
        
        // Setup and create loan
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address),
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("STX"),
                types.uint(100000000)
            ], deployer.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'create-loan-request', [
                types.uint(1000000000),
                types.uint(3000000000),
                types.ascii("STX"),
                types.uint(144000),
                types.uint(1000)
            ], borrower.address)
        ]);
        
        // Activate loan first time
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'activate-loan', [
                types.uint(1)
            ], deployer.address)
        ]);
        
        // Try to activate again
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'activate-loan', [
                types.uint(1)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1004)); // ERR-LOAN-ALREADY-ACTIVE
    },
});

Clarinet.test({
    name: "Ensure that liquidation works for expired loans",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let borrower = accounts.get('wallet_1')!;
        
        // Setup and create loan with very short duration
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address),
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("STX"),
                types.uint(100000000)
            ], deployer.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'create-loan-request', [
                types.uint(1000000000),
                types.uint(3000000000),
                types.ascii("STX"),
                types.uint(1440), // Minimum duration
                types.uint(1000)
            ], borrower.address)
        ]);
        
        // Activate loan
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'activate-loan', [
                types.uint(1)
            ], deployer.address)
        ]);
        
        // Mine blocks to simulate time passing (more than loan duration)
        for (let i = 0; i < 1500; i++) {
            chain.mineBlock([]);
        }
        
        // Liquidate expired loan
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'liquidate-loan', [
                types.uint(1)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify loan status changed to liquidated
        let loanCall = chain.callReadOnlyFn('micro-lend', 'get-loan', [types.uint(1)], borrower.address);
        let loan = loanCall.result.expectSome().expectTuple();
        assertEquals(loan['status'], types.ascii("LIQUIDATED"));
    },
});

Clarinet.test({
    name: "Ensure that liquidation fails for non-defaulted loans",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let borrower = accounts.get('wallet_1')!;
        
        // Setup and create loan
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address),
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("STX"),
                types.uint(100000000)
            ], deployer.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'create-loan-request', [
                types.uint(1000000000),
                types.uint(3000000000),
                types.ascii("STX"),
                types.uint(144000), // Long duration
                types.uint(1000)
            ], borrower.address)
        ]);
        
        // Activate loan
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'activate-loan', [
                types.uint(1)
            ], deployer.address)
        ]);
        
        // Try to liquidate non-defaulted loan
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'liquidate-loan', [
                types.uint(1)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1006)); // ERR-LOAN-NOT-DEFAULTED
    },
});

Clarinet.test({
    name: "Ensure that emergency stop prevents loan creation",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let borrower = accounts.get('wallet_1')!;
        
        // Setup collateral asset
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address),
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("STX"),
                types.uint(100000000)
            ], deployer.address)
        ]);
        
        // Enable emergency stop
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'toggle-emergency-stop', [], deployer.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Try to create loan while emergency stopped
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'create-loan-request', [
                types.uint(1000000000),
                types.uint(3000000000),
                types.ascii("STX"),
                types.uint(144000),
                types.uint(1000)
            ], borrower.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1011)); // ERR-EMERGENCY-STOP
    },
});

Clarinet.test({
    name: "Ensure that only owner can toggle emergency stop",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let wallet1 = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'toggle-emergency-stop', [], wallet1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1000)); // ERR-NOT-AUTHORIZED
    },
});

Clarinet.test({
    name: "Ensure that contract owner can be changed",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let newOwner = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'set-contract-owner', [
                types.principal(newOwner.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify new owner can perform owner functions
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("BTC")
            ], newOwner.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
    },
});

Clarinet.test({
    name: "Ensure that total due calculation works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let borrower = accounts.get('wallet_1')!;
        
        // Setup and create loan
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address),
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("STX"),
                types.uint(100000000)
            ], deployer.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'create-loan-request', [
                types.uint(1000000000), // 1000 loan amount
                types.uint(3000000000),
                types.ascii("STX"),
                types.uint(144000),
                types.uint(1000) // 10% interest rate
            ], borrower.address)
        ]);
        
        // Calculate total due (1000 + 10% = 1100)
        let totalDueCall = chain.callReadOnlyFn('micro-lend', 'calculate-total-due', [types.uint(1)], borrower.address);
        assertEquals(totalDueCall.result.expectOk(), types.uint(1100000000));
    },
});

Clarinet.test({
    name: "Ensure that contract status can be read correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        
        // Check initial status (should be false - not emergency stopped)
        let statusCall = chain.callReadOnlyFn('micro-lend', 'get-contract-status', [], deployer.address);
        assertEquals(statusCall.result, types.bool(false));
        
        // Toggle emergency stop
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'toggle-emergency-stop', [], deployer.address)
        ]);
        
        // Check status after emergency stop
        statusCall = chain.callReadOnlyFn('micro-lend', 'get-contract-status', [], deployer.address);
        assertEquals(statusCall.result, types.bool(true));
    },
});

Clarinet.test({
    name: "Ensure that user reputation is tracked correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let borrower = accounts.get('wallet_1')!;
        
        // Setup and create loan
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address),
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("STX"),
                types.uint(100000000)
            ], deployer.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'create-loan-request', [
                types.uint(1000000000),
                types.uint(3000000000),
                types.ascii("STX"),
                types.uint(1440), // Short duration for testing
                types.uint(1000)
            ], borrower.address)
        ]);
        
        // Activate and liquidate loan to test reputation system
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'activate-loan', [
                types.uint(1)
            ], deployer.address)
        ]);
        
        // Mine blocks to simulate time passing
        for (let i = 0; i < 1500; i++) {
            chain.mineBlock([]);
        }
        
        // Liquidate loan (should affect reputation negatively)
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'liquidate-loan', [
                types.uint(1)
            ], deployer.address)
        ]);
        
        // Check reputation was updated
        let reputationCall = chain.callReadOnlyFn('micro-lend', 'get-user-reputation', [
            types.principal(borrower.address)
        ], borrower.address);
        let reputation = reputationCall.result.expectSome().expectTuple();
        assertEquals(reputation['defaults'], types.uint(1));
        assertEquals(reputation['reputation-score'], types.uint(80)); // 100 - 20 penalty
    },
});

Clarinet.test({
    name: "Ensure that multiple loans can be created by same user",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let borrower = accounts.get('wallet_1')!;
        
        // Setup
        let block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'add-collateral-asset', [
                types.ascii("STX")
            ], deployer.address),
            Tx.contractCall('micro-lend', 'update-asset-price', [
                types.ascii("STX"),
                types.uint(100000000)
            ], deployer.address)
        ]);
        
        // Create first loan
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'create-loan-request', [
                types.uint(1000000000),
                types.uint(3000000000),
                types.ascii("STX"),
                types.uint(144000),
                types.uint(1000)
            ], borrower.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1));
        
        // Create second loan
        block = chain.mineBlock([
            Tx.contractCall('micro-lend', 'create-loan-request', [
                types.uint(2000000000),
                types.uint(5000000000),
                types.ascii("STX"),
                types.uint(144000),
                types.uint(1500)
            ], borrower.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.uint(2));
        
        // Verify both loans exist
        let loan1Call = chain.callReadOnlyFn('micro-lend', 'get-loan', [types.uint(1)], borrower.address);
        let loan2Call = chain.callReadOnlyFn('micro-lend', 'get-loan', [types.uint(2)], borrower.address);
        
        assertEquals(loan1Call.result.expectSome().expectTuple()['amount'], types.uint(1000000000));
        assertEquals(loan2Call.result.expectSome().expectTuple()['amount'], types.uint(2000000000));
    },
});