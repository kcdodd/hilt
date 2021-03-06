"use strict";

import http from 'axios';
import React from 'react';
import Radium from 'radium';
import * as Bootstrap from 'react-bootstrap';
import {report, subscribe} from 'journal';

import formatMessage from 'format-message';

export default React.createClass({
  getInitialState: function(){
    return {
      user: {
        username: 'no user'
      }
    };
  },
  componentWillMount: function(){
    this.subscription = subscribe({
      user: '#/user/current'
    }, state => {
      this.setState(state)
    });
  },
  componentWillUnmount: function(){
    this.subscription.unsubscribe();
  },
  register: function() {

    report({
      action: '#/modal/register',
      data: {show: true}
    });
  },
  logout: function() {
    report({
      action: '#/user/logout',
      data: {}
    });
  },
  render: function() {

    return (
      <Bootstrap.Navbar>
        <Bootstrap.Navbar.Header>
          {(brand => {
            if (brand){
              if (brand.imageUrl) {return (
                <Bootstrap.Navbar.Brand>
                  <a href={brand.url}>
                    <img src={brand.imageUrl} alt={brand.name} style={{height: '100%'}}/>
                  </a>
                </Bootstrap.Navbar.Brand>
              );}

              return (
                <Bootstrap.Navbar.Brand>
                  <a href={brand.url}>
                    {brand.name}
                  </a>
                </Bootstrap.Navbar.Brand>
              );
            }
          })(this.props.brand)}
          <Bootstrap.Navbar.Toggle/>
        </Bootstrap.Navbar.Header>
        <Bootstrap.Navbar.Collapse>
          <Bootstrap.Nav>
            {this.props.links.map((link, index) => {
              return <Bootstrap.NavItem key={index} href={link.url}>{link.name}</Bootstrap.NavItem>;
            })}
          </Bootstrap.Nav>
          <Bootstrap.Nav pullRight>
            <Bootstrap.NavDropdown
              title="Account"
              id="basic-nav-dropdown"
            >
              {(() => {
                if (this.state.user._id && !this.state.user.guest) {
                  return [
                    <Bootstrap.MenuItem key="1" href='#/settings'>
                    {formatMessage({
                      id: 'settings_menu_button',
                      default: 'Settings'
                    })}
                    </Bootstrap.MenuItem>,
                    <Bootstrap.MenuItem key="2" onSelect={this.logout}>
                    {formatMessage({
                      id: 'logout_menu_button',
                      default: 'Logout'
                    })}
                    </Bootstrap.MenuItem>
                  ];
                }

                return [
                  <Bootstrap.MenuItem key="0" onSelect={this.register}>
                  {formatMessage({
                    id: 'register_menu_button',
                    default: 'Register/Sign-In'
                  })}
                  </Bootstrap.MenuItem>
                ];
              })()}
            </Bootstrap.NavDropdown>
          </Bootstrap.Nav>
        </Bootstrap.Navbar.Collapse>
      </Bootstrap.Navbar>
    );
  }
});
