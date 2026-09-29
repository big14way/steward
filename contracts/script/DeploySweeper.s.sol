// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {YieldSweeper} from "../src/YieldSweeper.sol";

/// Redeploy only the YieldSweeper against an existing vault (e.g. after changing owner/agent/floor semantics).
///   OWNER_ADDRESS=<circle owner wallet> AGENT_ADDRESS=<circle agent wallet> VAULT=<existing 4626> RESERVE_FLOOR=1000000 \
///   forge script script/DeploySweeper.s.sol --rpc-url arc_testnet --broadcast --with-gas-price 25gwei --priority-gas-price 1gwei
contract DeploySweeper is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.envAddress("OWNER_ADDRESS");
        address agent = vm.envAddress("AGENT_ADDRESS");
        address vault = vm.envAddress("VAULT");
        uint128 floor = uint128(vm.envOr("RESERVE_FLOOR", uint256(100e6)));

        vm.startBroadcast(pk);
        YieldSweeper sweeper = new YieldSweeper(ARC_USDC, vault, owner, agent, floor);
        vm.stopBroadcast();

        console2.log("YieldSweeper", address(sweeper));
        console2.log("owner", owner);
        console2.log("agent", agent);
    }
}
