pragma solidity ^0.5.16;

import "./ERC20.sol";

// JoeBar is the mock contract for testing.
// Ref: https://etherscan.io/address/0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272#code
contract JoeBar is StandardToken(0, "JoeBar", 18, "xJOE") {
    using SafeMath for uint256;
    ERC20 public joe;

    constructor(ERC20 _joe) public {
        joe = _joe;
    }

    function _mint(address _to, uint256 _amount) internal returns (bool) {
        totalSupply = totalSupply.add(_amount);
        balanceOf[_to] = balanceOf[_to].add(_amount);
        return true;
    }

    function _burn(address _to, uint256 _amount) internal returns (bool) {
        totalSupply = totalSupply.sub(_amount);
        balanceOf[_to] = balanceOf[_to].sub(_amount);
        return true;
    }

    // Enter the bar. Pay some JOEs. Earn some shares.
    function enter(uint256 _amount) public {
        uint256 totalJoe = joe.balanceOf(address(this));
        uint256 totalShares = totalSupply;
        if (totalShares == 0 || totalJoe == 0) {
            _mint(msg.sender, _amount);
        } else {
            uint256 what = _amount.mul(totalShares).div(totalJoe);
            _mint(msg.sender, what);
        }
        joe.transferFrom(msg.sender, address(this), _amount);
    }

    // Leave the bar. Claim back your JOEs.
    function leave(uint256 _share) public {
        uint256 totalShares = totalSupply;
        uint256 what = _share.mul(joe.balanceOf(address(this))).div(totalShares);
        _burn(msg.sender, _share);
        joe.transfer(msg.sender, what);
    }
}
