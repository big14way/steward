// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/// Owner-controlled reserve that parks idle USDC in a 4626-shaped vault (USYC Teller adapter or MockUSYC).
/// ADAPT: if using the real USYC Teller, write a thin adapter exposing deposit/redeem in 4626 shape.
contract YieldSweeper {
    using SafeERC20 for IERC20;

    IERC20 public immutable USDC;
    IERC4626 public immutable VAULT;
    address public owner;
    address public agent;
    uint128 public reserveFloor; // 6 dp USDC always kept liquid

    event Swept(uint256 assets, uint256 shares);
    event Redeemed(uint256 shares, uint256 assets);

    error NotOwner(); error NotAgentOrOwner(); error BelowFloor();

    event OwnerChanged(address indexed previousOwner, address indexed newOwner);
    event AgentChanged(address indexed previousAgent, address indexed newAgent);

    /// @param _owner the treasury owner (a Circle Developer-Controlled wallet in the reference deployment), not the deployer.
    constructor(address usdc, address vault, address _owner, address _agent, uint128 _floor) {
        USDC = IERC20(usdc); VAULT = IERC4626(vault); owner = _owner; agent = _agent; reserveFloor = _floor;
        USDC.forceApprove(vault, type(uint256).max);
    }

    function setFloor(uint128 f) external { if (msg.sender != owner) revert NotOwner(); reserveFloor = f; }
    function setAgent(address a) external { if (msg.sender != owner) revert NotOwner(); emit AgentChanged(agent, a); agent = a; }
    function transferOwnership(address o) external { if (msg.sender != owner) revert NotOwner(); emit OwnerChanged(owner, o); owner = o; }

    /// Sweep everything above (floor + obligations) into the vault. Agent computes `obligations` off-chain and logs it.
    function sweep(uint128 obligationsNext7d) external returns (uint256 shares) {
        if (msg.sender != agent && msg.sender != owner) revert NotAgentOrOwner();
        uint256 bal = USDC.balanceOf(address(this));
        uint256 keep = uint256(reserveFloor) + obligationsNext7d;
        if (bal <= keep) revert BelowFloor();
        uint256 assets = bal - keep;
        shares = VAULT.deposit(assets, address(this));
        emit Swept(assets, shares);
    }

    function redeem(uint256 shares) external returns (uint256 assets) {
        if (msg.sender != agent && msg.sender != owner) revert NotAgentOrOwner();
        assets = VAULT.redeem(shares, address(this), address(this));
        emit Redeemed(shares, assets);
    }

    function withdrawToOwner(uint256 amount) external { if (msg.sender != owner) revert NotOwner(); USDC.safeTransfer(owner, amount); }
}
