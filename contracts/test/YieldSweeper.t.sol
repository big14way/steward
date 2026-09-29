// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {YieldSweeper} from "../src/YieldSweeper.sol";
import {MockUSYC} from "../src/mocks/MockUSYC.sol";

contract MockUSDC2 is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

contract YieldSweeperTest is Test {
    MockUSDC2 usdc;
    MockUSYC vault;
    YieldSweeper sw;

    address owner = address(this);
    address agent = makeAddr("agent");
    address rando = makeAddr("rando");
    uint128 constant ONE = 1e6;
    uint128 constant FLOOR = 100 * ONE;

    event Swept(uint256 assets, uint256 shares);
    event Redeemed(uint256 shares, uint256 assets);

    function setUp() public {
        usdc = new MockUSDC2();
        vault = new MockUSYC(IERC20(address(usdc)));
        sw = new YieldSweeper(address(usdc), address(vault), owner, agent, FLOOR);
        usdc.mint(address(sw), 1_000 * ONE);
    }

    function test_constructor_ownerIsParameterNotDeployer() public {
        address circleOwner = makeAddr("circle-owner");
        YieldSweeper s2 = new YieldSweeper(address(usdc), address(vault), circleOwner, agent, FLOOR);
        assertEq(s2.owner(), circleOwner);
        vm.expectRevert(YieldSweeper.NotOwner.selector); s2.setFloor(1);          // deployer (this) is not the owner
        vm.prank(circleOwner); s2.setFloor(5 * ONE); assertEq(s2.reserveFloor(), 5 * ONE);
    }

    function test_setAgent_and_transferOwnership_onlyOwner() public {
        address agent2 = makeAddr("agent2");
        vm.prank(rando); vm.expectRevert(YieldSweeper.NotOwner.selector); sw.setAgent(agent2);
        sw.setAgent(agent2); assertEq(sw.agent(), agent2);
        vm.prank(agent); vm.expectRevert(YieldSweeper.NotAgentOrOwner.selector); sw.sweep(0);   // old agent locked out
        vm.prank(agent2); sw.sweep(0);
        address owner2 = makeAddr("owner2");
        vm.prank(rando); vm.expectRevert(YieldSweeper.NotOwner.selector); sw.transferOwnership(owner2);
        sw.transferOwnership(owner2); assertEq(sw.owner(), owner2);
        vm.expectRevert(YieldSweeper.NotOwner.selector); sw.setFloor(1);
    }

    function test_constructor_setsRolesAndApproval() public view {
        assertEq(sw.owner(), owner); assertEq(sw.agent(), agent); assertEq(sw.reserveFloor(), FLOOR);
        assertEq(usdc.allowance(address(sw), address(vault)), type(uint256).max);
    }

    function test_sweep_depositsEverythingAboveFloorPlusObligations() public {
        vm.expectEmit(false, false, false, true);
        emit Swept(600 * ONE, 600 * ONE);          // 1000 − 100 floor − 300 obligations; 1:1 on an empty vault
        vm.prank(agent);
        uint256 shares = sw.sweep(300 * ONE);
        assertEq(shares, 600 * ONE);
        assertEq(usdc.balanceOf(address(sw)), 400 * ONE);
        assertEq(vault.balanceOf(address(sw)), 600 * ONE);
        assertEq(vault.totalAssets(), 600 * ONE);
    }

    function test_sweep_ownerCanToo() public {
        sw.sweep(0);
        assertEq(usdc.balanceOf(address(sw)), FLOOR);
    }

    function test_sweep_revertsBelowFloor() public {
        vm.prank(agent); vm.expectRevert(YieldSweeper.BelowFloor.selector); sw.sweep(900 * ONE);   // 100 + 900 = 1000 = bal → nothing idle
        vm.prank(agent); vm.expectRevert(YieldSweeper.BelowFloor.selector); sw.sweep(950 * ONE);
    }

    function test_sweep_onlyAgentOrOwner() public {
        vm.prank(rando); vm.expectRevert(YieldSweeper.NotAgentOrOwner.selector); sw.sweep(0);
    }

    function test_redeem_returnsAssets() public {
        vm.prank(agent); uint256 shares = sw.sweep(0);
        vm.expectEmit(false, false, false, true);
        emit Redeemed(shares / 2, 450 * ONE);
        vm.prank(agent); uint256 assets = sw.redeem(shares / 2);
        assertEq(assets, 450 * ONE);
        assertEq(usdc.balanceOf(address(sw)), 550 * ONE);
    }

    function test_redeem_capturesYield() public {
        vm.prank(agent); uint256 shares = sw.sweep(0);          // 900 in
        usdc.mint(address(vault), 90 * ONE);                     // 10% yield accrues to the vault
        vm.prank(agent); uint256 assets = sw.redeem(shares);
        assertGt(assets, 900 * ONE);
        assertApproxEqAbs(assets, 990 * ONE, 1);
    }

    function test_redeem_onlyAgentOrOwner() public {
        vm.prank(rando); vm.expectRevert(YieldSweeper.NotAgentOrOwner.selector); sw.redeem(1);
    }

    function test_setFloor_onlyOwner() public {
        sw.setFloor(250 * ONE); assertEq(sw.reserveFloor(), 250 * ONE);
        vm.prank(agent); vm.expectRevert(YieldSweeper.NotOwner.selector); sw.setFloor(1);
        vm.prank(agent); sw.sweep(0);
        assertEq(usdc.balanceOf(address(sw)), 250 * ONE);
    }

    function test_withdrawToOwner_onlyOwner() public {
        uint256 before = usdc.balanceOf(owner);
        sw.withdrawToOwner(100 * ONE);
        assertEq(usdc.balanceOf(owner), before + 100 * ONE);
        vm.prank(agent); vm.expectRevert(YieldSweeper.NotOwner.selector); sw.withdrawToOwner(1);
    }

    function testFuzz_sweep_neverBreaksFloor(uint128 obligations) public {
        obligations = uint128(bound(obligations, 0, 2_000 * ONE));
        vm.prank(agent);
        uint256 keep = uint256(FLOOR) + obligations;
        if (1_000 * ONE <= keep) { vm.expectRevert(YieldSweeper.BelowFloor.selector); sw.sweep(obligations); return; }
        sw.sweep(obligations);
        assertEq(usdc.balanceOf(address(sw)), keep);
    }
}
