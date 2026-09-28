// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AllowanceManager} from "../src/AllowanceManager.sol";
import {AuditLog} from "../src/AuditLog.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

contract AllowanceManagerTest is Test {
    AllowanceManager am;
    AuditLog auditLog;
    MockUSDC usdc;

    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address payee = makeAddr("payee");
    address rando = makeAddr("rando");

    uint128 constant ONE = 1e6;
    uint128 constant CAP_PERIOD = 800 * 1e6;
    uint128 constant CAP_TX     = 200 * 1e6;
    uint64  constant WEEK       = 7 days;

    event Paid(uint256 indexed id, uint128 amount, bytes32 indexed decisionHash, string memo);
    event Escalated(uint256 indexed id, uint128 amount, bytes32 indexed decisionHash, string reason);
    event Approved(uint256 indexed id, uint128 amount, bytes32 indexed decisionHash);
    event Revoked(uint256 indexed id, uint128 refunded);
    event Decision(address indexed agent, uint256 indexed allowanceId, bytes32 indexed decisionHash, AuditLog.Action action, uint128 amount, uint64 blockNumber);

    function setUp() public {
        usdc = new MockUSDC();
        am = new AllowanceManager(address(usdc));
        auditLog = new AuditLog();
        usdc.mint(owner, 10_000 * ONE);
        vm.prank(owner);
        usdc.approve(address(am), type(uint256).max);
    }

    function _create(uint64 expiry) internal returns (uint256 id) {
        vm.prank(owner);
        id = am.create(agent, payee, CAP_PERIOD, CAP_TX, WEEK, expiry);
    }
    function _createAndFund(uint128 amount) internal returns (uint256 id) {
        id = _create(0);
        vm.prank(owner);
        am.fund(id, amount);
    }
    function _hash(string memory s) internal pure returns (bytes32) { return keccak256(abi.encodePacked(s)); }
    function _pay(uint256 id, uint128 amt, string memory h) internal {
        vm.prank(agent);
        am.pay(id, amt, _hash(h), "milestone");
    }
    /// ADAPT: destructuring the 11-field tuple hits "stack too deep" on solc 0.8.24 without via-IR;
    /// the struct is all static types, so its ABI encoding equals the getter's tuple encoding and abi.decode is exact.
    function _get(uint256 id) internal view returns (AllowanceManager.Allowance memory a) {
        (bool ok, bytes memory d) = address(am).staticcall(abi.encodeWithSelector(am.allowances.selector, id));
        require(ok, "allowances() failed");
        a = abi.decode(d, (AllowanceManager.Allowance));
    }

    // 1. Creation
    function test_create_storesFields() public {
        uint256 id = _create(0);
        AllowanceManager.Allowance memory a = _get(id);
        assertEq(a.owner, owner); assertEq(a.agent, agent); assertEq(a.payee, payee);
        assertEq(a.capPerPeriod, CAP_PERIOD); assertEq(a.perTxCap, CAP_TX); assertEq(a.period, WEEK);
        assertEq(a.periodStart, uint64(block.timestamp)); assertEq(a.expiry, 0);
        assertEq(a.spentThisPeriod, 0); assertEq(a.funded, 0); assertFalse(a.revoked);
        assertEq(am.nextId(), 1);
    }
    function test_create_revertsZeroPayee() public {
        vm.prank(owner);
        vm.expectRevert(AllowanceManager.ZeroPayee.selector);
        am.create(agent, address(0), CAP_PERIOD, CAP_TX, WEEK, 0);
    }
    function test_create_idsIncrement() public { uint256 a = _create(0); uint256 b = _create(0); assertEq(b, a + 1); }

    // 2. Funding
    function test_fund_movesUsdcIntoContract() public {
        uint256 id = _createAndFund(500 * ONE);
        assertEq(usdc.balanceOf(address(am)), 500 * ONE);
        assertEq(_get(id).funded, 500 * ONE);
    }
    function test_fund_onlyOwner() public {
        uint256 id = _create(0);
        usdc.mint(rando, ONE);
        vm.startPrank(rando);
        usdc.approve(address(am), ONE);
        vm.expectRevert(AllowanceManager.NotOwner.selector);
        am.fund(id, ONE);
        vm.stopPrank();
    }

    // 3. Pay
    function test_pay_happyPath() public {
        uint256 id = _createAndFund(500 * ONE);
        vm.expectEmit(true, true, true, true);
        emit Paid(id, 150 * ONE, _hash("d1"), "milestone");
        _pay(id, 150 * ONE, "d1");
        assertEq(usdc.balanceOf(payee), 150 * ONE);
        AllowanceManager.Allowance memory a = _get(id);
        assertEq(a.funded, 350 * ONE); assertEq(a.spentThisPeriod, 150 * ONE);
        assertTrue(am.usedDecision(_hash("d1")));
    }
    function test_pay_onlyAgent() public {
        uint256 id = _createAndFund(500 * ONE);
        vm.prank(owner); vm.expectRevert(AllowanceManager.NotAgent.selector); am.pay(id, ONE, _hash("x"), "");
        vm.prank(rando); vm.expectRevert(AllowanceManager.NotAgent.selector); am.pay(id, ONE, _hash("y"), "");
    }
    function test_pay_revertsOverPerTxCap() public {
        uint256 id = _createAndFund(500 * ONE);
        vm.prank(agent); vm.expectRevert(AllowanceManager.OverPerTx.selector); am.pay(id, CAP_TX + 1, _hash("big"), "");
    }
    function test_pay_exactlyPerTxCapSucceeds() public {
        uint256 id = _createAndFund(500 * ONE);
        _pay(id, CAP_TX, "edge");
        assertEq(usdc.balanceOf(payee), CAP_TX);
    }
    function test_pay_revertsOverPeriodCap() public {
        uint256 id = _createAndFund(2_000 * ONE);
        _pay(id, 200 * ONE, "a"); _pay(id, 200 * ONE, "b"); _pay(id, 200 * ONE, "c"); _pay(id, 200 * ONE, "d");
        vm.prank(agent); vm.expectRevert(AllowanceManager.OverPeriod.selector); am.pay(id, ONE, _hash("e"), "");
    }
    function test_pay_revertsUnderfunded() public {
        uint256 id = _createAndFund(100 * ONE);
        vm.prank(agent); vm.expectRevert(AllowanceManager.Underfunded.selector); am.pay(id, 150 * ONE, _hash("uf"), "");
    }

    // 4. Idempotency
    function test_pay_sameDecisionHashTwiceReverts() public {
        uint256 id = _createAndFund(500 * ONE);
        _pay(id, 50 * ONE, "retry-me");
        vm.prank(agent); vm.expectRevert(AllowanceManager.DecisionUsed.selector); am.pay(id, 50 * ONE, _hash("retry-me"), "milestone");
        assertEq(usdc.balanceOf(payee), 50 * ONE);
    }
    function test_decisionHash_sharedAcrossPayAndApprove() public {
        uint256 id = _createAndFund(500 * ONE);
        _pay(id, 50 * ONE, "h");
        vm.prank(owner); vm.expectRevert(AllowanceManager.DecisionUsed.selector); am.approveAndPay(id, 50 * ONE, _hash("h"));
    }

    // 5. Period
    function test_period_resetsAfterOneWeek() public {
        uint256 id = _createAndFund(2_000 * ONE);
        for (uint8 i; i < 4; ++i) _pay(id, 200 * ONE, string(abi.encodePacked("w1-", i)));
        vm.warp(block.timestamp + WEEK);
        _pay(id, 200 * ONE, "w2-0");
        assertEq(_get(id).spentThisPeriod, 200 * ONE);
    }
    function test_period_multiplePeriodsElapsedAlignsStart() public {
        uint256 id = _createAndFund(2_000 * ONE);
        uint64 start = _get(id).periodStart;
        vm.warp(block.timestamp + 3 * WEEK + 1 hours);
        _pay(id, ONE, "late");
        assertEq(_get(id).periodStart, start + 3 * WEEK);
    }
    function test_period_sameTimestampTwoBlocks_noDoubleRoll() public {
        uint256 id = _createAndFund(2_000 * ONE);
        vm.warp(block.timestamp + WEEK);
        _pay(id, 100 * ONE, "t1");
        vm.roll(block.number + 1);
        _pay(id, 100 * ONE, "t2");
        assertEq(_get(id).spentThisPeriod, 200 * ONE);
    }
    function test_period_zeroMeansNoReset() public {
        vm.prank(owner); uint256 id = am.create(agent, payee, 300 * ONE, CAP_TX, 0, 0);
        vm.prank(owner); am.fund(id, 1_000 * ONE);
        _pay(id, 200 * ONE, "p0");
        vm.warp(block.timestamp + 365 days);
        vm.prank(agent); vm.expectRevert(AllowanceManager.OverPeriod.selector); am.pay(id, 200 * ONE, _hash("p1"), "");
    }

    // 6. Expiry
    function test_expiry_blocksPayAfterExpiry() public {
        uint64 exp = uint64(block.timestamp + 1 days);
        uint256 id = _create(exp);
        vm.prank(owner); am.fund(id, 500 * ONE);
        vm.warp(exp + 1);
        vm.prank(agent); vm.expectRevert(AllowanceManager.Expired.selector); am.pay(id, ONE, _hash("exp"), "");
    }
    function test_expiry_ownerCanStillRevokeAndRefund() public {
        uint64 exp = uint64(block.timestamp + 1 days);
        uint256 id = _create(exp);
        vm.prank(owner); am.fund(id, 500 * ONE);
        vm.warp(exp + 1);
        uint256 before = usdc.balanceOf(owner);
        vm.prank(owner); am.revoke(id);
        assertEq(usdc.balanceOf(owner), before + 500 * ONE);
    }

    // 7. Escalation
    function test_escalate_emitsAndMovesNothing() public {
        uint256 id = _createAndFund(500 * ONE);
        vm.expectEmit(true, true, true, true);
        emit Escalated(id, 350 * ONE, _hash("esc"), "over per-tx cap");
        vm.prank(agent); am.escalate(id, 350 * ONE, _hash("esc"), "over per-tx cap");
        assertEq(usdc.balanceOf(payee), 0); assertEq(_get(id).funded, 500 * ONE);
    }
    function test_escalate_onlyAgent() public {
        uint256 id = _createAndFund(500 * ONE);
        vm.prank(rando); vm.expectRevert(AllowanceManager.NotAgent.selector); am.escalate(id, ONE, _hash("r"), "");
    }
    function test_approveAndPay_bypassesCapsNotFunding() public {
        uint256 id = _createAndFund(500 * ONE);
        vm.expectEmit(true, true, true, true);
        emit Approved(id, 350 * ONE, _hash("esc"));
        vm.prank(owner); am.approveAndPay(id, 350 * ONE, _hash("esc"));
        assertEq(usdc.balanceOf(payee), 350 * ONE);
        assertEq(_get(id).funded, 150 * ONE);
        assertEq(_get(id).spentThisPeriod, 0);
    }
    function test_approveAndPay_revertsUnderfunded() public {
        uint256 id = _createAndFund(100 * ONE);
        vm.prank(owner); vm.expectRevert(AllowanceManager.Underfunded.selector); am.approveAndPay(id, 150 * ONE, _hash("uf"));
    }
    function test_approveAndPay_onlyOwner() public {
        uint256 id = _createAndFund(500 * ONE);
        vm.prank(agent); vm.expectRevert(AllowanceManager.NotOwner.selector); am.approveAndPay(id, ONE, _hash("a"));
    }

    // 8. Revoke
    function test_revoke_refundsAndBlocksAgent() public {
        uint256 id = _createAndFund(500 * ONE);
        _pay(id, 100 * ONE, "pre");
        uint256 before = usdc.balanceOf(owner);
        vm.expectEmit(true, false, false, true);
        emit Revoked(id, 400 * ONE);
        vm.prank(owner); am.revoke(id);
        assertEq(usdc.balanceOf(owner), before + 400 * ONE);
        assertEq(_get(id).funded, 0);
        vm.prank(agent); vm.expectRevert(AllowanceManager.IsRevoked.selector); am.pay(id, ONE, _hash("post"), "");
    }
    function test_revoke_blocksApproveToo() public {
        uint256 id = _createAndFund(500 * ONE);
        vm.prank(owner); am.revoke(id);
        vm.prank(owner); vm.expectRevert(AllowanceManager.IsRevoked.selector); am.approveAndPay(id, ONE, _hash("r"));
    }
    function test_revoke_onlyOwner() public {
        uint256 id = _createAndFund(500 * ONE);
        vm.prank(agent); vm.expectRevert(AllowanceManager.NotOwner.selector); am.revoke(id);
    }

    // 9. AuditLog
    function test_auditLog_emitsWithBlockNumber() public {
        vm.roll(1234);
        vm.expectEmit(true, true, true, true);
        emit Decision(agent, 0, _hash("hold"), AuditLog.Action.HOLD, 0, 1234);
        vm.prank(agent); auditLog.record(0, _hash("hold"), AuditLog.Action.HOLD, 0);
    }

    // 10. Fuzz
    function testFuzz_pay_neverExceedsBounds(uint128 amt) public {
        uint256 id = _createAndFund(500 * ONE);
        vm.prank(agent);
        if (amt > CAP_TX || amt > CAP_PERIOD || amt > 500 * ONE) {
            vm.expectRevert();
            am.pay(id, amt, _hash("f"), "");
        } else {
            am.pay(id, amt, _hash("f"), "");
            assertEq(usdc.balanceOf(payee), amt);
        }
    }
    function testFuzz_periodCapHolds(uint8 n, uint128 seed) public {
        n = uint8(bound(n, 1, 12));
        uint256 id = _createAndFund(10_000 * ONE);
        uint128 total;
        for (uint8 i; i < n; ++i) {
            uint128 amt = uint128(bound(uint256(keccak256(abi.encode(seed, i))), 1, CAP_TX));
            vm.prank(agent);
            try am.pay(id, amt, keccak256(abi.encode("fz", seed, i)), "") { total += amt; } catch {}
        }
        assertLe(total, CAP_PERIOD);
        assertEq(usdc.balanceOf(payee), total);
    }
}

/// Only meaningful on arc-anvil or an Arc testnet fork (chainid 5042002); otherwise every test returns early.
contract ArcForkTest is Test {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address constant BLOCKLISTED = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    AllowanceManager am;
    address owner = makeAddr("arc-owner");
    address agent = makeAddr("arc-agent");
    address payee = makeAddr("arc-payee");

    modifier onlyArc() { if (block.chainid != 5042002) return; _; }

    function setUp() public {
        if (block.chainid != 5042002) return;
        am = new AllowanceManager(ARC_USDC);
        vm.deal(owner, 1_000 * 1e18); // ADAPT: if vm.deal is rejected on the precompile-backed balance, fund from faucet instead
        vm.prank(owner);
        (bool ok,) = ARC_USDC.call(abi.encodeWithSignature("approve(address,uint256)", address(am), type(uint256).max));
        require(ok, "approve failed");
    }

    function test_arc_decimalsAreOneBalance() public onlyArc {
        (, bytes memory data) = ARC_USDC.staticcall(abi.encodeWithSignature("balanceOf(address)", owner));
        assertEq(abi.decode(data, (uint256)), owner.balance / 1e12);
    }
    function test_arc_payWorksOnRealUsdc() public onlyArc {
        vm.prank(owner); uint256 id = am.create(agent, payee, 800e6, 200e6, 7 days, 0);
        vm.prank(owner); am.fund(id, 500e6);
        vm.prank(agent); am.pay(id, 150e6, keccak256("arc-d1"), "milestone");
        (, bytes memory data) = ARC_USDC.staticcall(abi.encodeWithSignature("balanceOf(address)", payee));
        assertEq(abi.decode(data, (uint256)), 150e6);
    }
    function test_arc_payToBlocklistedPayeeReverts() public onlyArc {
        vm.prank(owner); uint256 id = am.create(agent, BLOCKLISTED, 800e6, 200e6, 7 days, 0);
        vm.prank(owner); am.fund(id, 500e6);
        vm.prank(agent); vm.expectRevert(); am.pay(id, 100e6, keccak256("arc-blocked"), "should never land");
    }
}
