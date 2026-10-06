// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TestToken
/// @notice 18-decimal testnet token (tETH, tUSD) for the clim twin pools. The owner mints for the pools and the bots;
///         anyone can call faucet() once per FAUCET_COOLDOWN to try the dashboard's /swap and /lp pages.
contract TestToken is ERC20, Ownable {
    uint256 public constant FAUCET_COOLDOWN = 1 hours;
    uint256 public immutable faucetAmount;
    mapping(address => uint256) public lastFaucetAt;

    error FaucetCooldown(uint256 nextAt);

    constructor(string memory name_, string memory symbol_, address owner_, uint256 faucetAmount_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        faucetAmount = faucetAmount_;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Sends faucetAmount to the caller, at most once per FAUCET_COOLDOWN per address. Testnet only.
    function faucet() external {
        uint256 last = lastFaucetAt[msg.sender];
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) revert FaucetCooldown(last + FAUCET_COOLDOWN);
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
    }
}
