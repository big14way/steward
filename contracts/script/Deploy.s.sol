// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AllowanceManager} from "../src/AllowanceManager.sol";
import {AuditLog} from "../src/AuditLog.sol";
import {YieldSweeper} from "../src/YieldSweeper.sol";
import {MockUSYC} from "../src/mocks/MockUSYC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Usage (note the 20 gwei floor — mandatory on Arc):
///   set -a; source .env; set +a
///   forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --with-gas-price 20gwei --priority-gas-price 1gwei -vvvv
/// .env: DEPLOYER_PRIVATE_KEY, AGENT_ADDRESS, USE_MOCK_USYC=true|false, USYC_VAULT (if real adapter deployed)
contract Deploy is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address agent = vm.envAddress("AGENT_ADDRESS");
        address owner = vm.envOr("OWNER_ADDRESS", vm.addr(pk));   // treasury owner = Circle owner wallet; falls back to the deployer
        bool useMock = vm.envOr("USE_MOCK_USYC", true);
        uint128 floor = uint128(vm.envOr("RESERVE_FLOOR", uint256(100e6)));   // 100 USDC default; 1 USDC for faucet-sized budgets

        vm.startBroadcast(pk);
        AllowanceManager am = new AllowanceManager(ARC_USDC);
        AuditLog log = new AuditLog();
        address vault = useMock ? address(new MockUSYC(IERC20(ARC_USDC))) : vm.envAddress("USYC_VAULT");
        YieldSweeper sweeper = new YieldSweeper(ARC_USDC, vault, owner, agent, floor);
        vm.stopBroadcast();

        console2.log("AllowanceManager", address(am));
        console2.log("AuditLog", address(log));
        console2.log("Vault", vault);
        console2.log("YieldSweeper", address(sweeper));
    }
}
