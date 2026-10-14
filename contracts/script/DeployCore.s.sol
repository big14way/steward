// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AllowanceManager} from "../src/AllowanceManager.sol";
import {AuditLog} from "../src/AuditLog.sol";

/// Mainnet core: AllowanceManager + AuditLog only (about 1.22M gas, 0.025 USDC at Arc's 20 gwei floor).
/// The yield reserve (YieldSweeper + vault) is a separate, optional deploy; the API and agent run without it.
///   set -a; source .env; set +a
///   forge script script/DeployCore.s.sol --rpc-url arc_mainnet --broadcast --with-gas-price 20gwei --priority-gas-price 1gwei -vvvv
contract DeployCore is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);
        AllowanceManager am = new AllowanceManager(ARC_USDC);
        AuditLog log = new AuditLog();
        vm.stopBroadcast();
        console2.log("AllowanceManager", address(am));
        console2.log("AuditLog", address(log));
    }
}
