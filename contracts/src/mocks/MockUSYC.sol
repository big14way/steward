// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Stand-in for USYC on testnet when the Teller allowlist is pending. Same deposit/redeem shape.
contract MockUSYC is ERC4626 {
    constructor(IERC20 usdc) ERC20("Mock USYC", "mUSYC") ERC4626(usdc) {}
    function decimals() public pure override returns (uint8) { return 6; }
}
